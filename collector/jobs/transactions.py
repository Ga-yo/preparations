"""국토교통부 아파트 매매 실거래가(상세) 적재 — 수도권 시군구 × 최근 N개월.

API: http://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev
PublicDataReader TransactionPrice.get_data("아파트", "매매", 시군구5자리, year_month="YYYYMM", translate=False).
필드명은 PublicDataReader 1.1.1.post2 meta_dict 기준. 값 형식(cdealType "O", cdealDay "YY.MM.DD")은
실제 응답 fixture로 아직 확인 전이라, 형식이 다르면 조용히 틀리지 않고 ValueError로 실패한다.
서비스키가 URL 쿼리(serviceKey=)에 실리므로 예외는 시군구·연월·예외 이름(또는 HTTP 상태코드)만 남긴다.
"""
import hashlib
import os
import re
from datetime import date, datetime
from zoneinfo import ZoneInfo

import pandas as pd
import PublicDataReader as pdr

from lib import db

DATASET = "transactions:apartment"
RETENTION_MONTHS = 24
SOURCE = "국토교통부 아파트 매매 실거래가 상세 (PublicDataReader TransactionPrice)"
KEY_FIELDS = ("sggCd", "umdCd", "jibun", "aptSeq", "aptNm", "aptDong", "excluUseAr", "floor",
              "dealYear", "dealMonth", "dealDay", "dealAmount")  # 해제·거래유형·등기일은 재수집 때 바뀌므로 제외
CANCEL_DAY = re.compile(r"^(\d{2})\.(\d{2})\.(\d{2})$")


class HttpStatusError(Exception):
    def __init__(self, status: int):
        super().__init__(f"HTTP {status}")
        self.status = status


class _Api(pdr.TransactionPrice):
    # PublicDataReader는 non-200을 print하고 빈 결과로 돌려줘 "거래 0건"과 구분되지 않는다
    def _response_to_item_data(self, res, *args):
        if res.status_code != 200:
            raise HttpStatusError(res.status_code)
        return super()._response_to_item_data(res, *args)


def kst_today() -> date:
    return datetime.now(ZoneInfo("Asia/Seoul")).date()


def parse_months(raw: str | None) -> int:
    if raw is None:
        return 2
    if not re.fullmatch(r"\d{1,2}", raw) or not 1 <= int(raw) <= RETENTION_MONTHS:
        raise ValueError("TRANSACTIONS_MONTHS must be an integer 1-24")
    return int(raw)


def year_months(today: date, n: int) -> list[str]:
    i = today.year * 12 + today.month - 1
    return [f"{k // 12}{k % 12 + 1:02d}" for k in range(i - n + 1, i + 1)]


def _s(v) -> str | None:
    # get_data는 astype(str)을 거쳐 결측이 'nan'/'None'/'<NA>' 문자열이 된다
    if v is None or v is pd.NA or (isinstance(v, float) and pd.isna(v)):
        return None
    s = str(v).strip()
    return None if s in ("", "nan", "None", "<NA>") else s


def _int(v) -> int | None:
    s = _s(v)
    return None if s is None else int(float(s.replace(",", "")))


def source_key(x) -> str:
    parts = [_s(x.get(f)) or "" for f in KEY_FIELDS]
    parts = [p.replace(",", "") for p in parts]
    return "apt:" + hashlib.sha1("|".join(parts).encode()).hexdigest()[:20]


def _cancel_date(x) -> str | None:
    if _s(x.get("cdealType")) != "O":
        return None
    m = CANCEL_DAY.match(_s(x.get("cdealDay")) or "")
    if not m:
        raise ValueError("unexpected cdealDay format")
    return f"20{m[1]}-{m[2]}-{m[3]}"


def transform(df: pd.DataFrame, valid_codes: set[str]) -> tuple[list[dict], dict[str, int]]:
    rows: dict[str, dict] = {}
    skips = {"unknown_region": 0, "duplicate": 0}
    for x in df.to_dict("records"):
        sgg, umd = _s(x.get("sggCd")), _s(x.get("umdCd"))
        code = f"{sgg}{umd}" if sgg and umd else None
        if code not in valid_codes:  # 신설·폐지 코드는 FK 위반으로 배치 전체가 실패하지 않게 건너뛴다
            skips["unknown_region"] += 1
            continue
        key = source_key(x)
        if key in rows:  # 한 upsert 배치에 같은 키가 두 번 있으면 Postgres가 배치를 거부한다
            skips["duplicate"] += 1
            continue
        rows[key] = {
            "source_key": key, "property_type": "apartment", "region_code": code,
            "building_name": _s(x.get("aptNm")), "jibun": _s(x.get("jibun")),
            "exclusive_area": float(_s(x.get("excluUseAr"))), "floor": _int(x.get("floor")),
            "deal_amount": _int(x.get("dealAmount")) * 10_000,  # 만원 → 원
            "deal_date": f"{_int(x.get('dealYear'))}-{_int(x.get('dealMonth')):02d}-{_int(x.get('dealDay')):02d}",
            "build_year": _int(x.get("buildYear")), "deal_type": _s(x.get("dealingGbn")),
            "cancel_date": _cancel_date(x),
        }
    return list(rows.values()), skips


def fetch(api, sgg: str, ym: str) -> pd.DataFrame:
    try:
        return api.get_data("아파트", "매매", sgg, year_month=ym, translate=False)
    except HttpStatusError as e:
        raise RuntimeError(f"{sgg} {ym}: HTTP {e.status}") from None
    except Exception as e:
        raise RuntimeError(f"{sgg} {ym}: {type(e).__name__}") from None  # 원본 메시지에 서비스키가 든 URL이 있을 수 있다


def sigungu_codes() -> list[str]:
    return [r["sigungu_code"] for r in db.client().table("capital_sigungu").select("sigungu_code").execute().data]


def region_codes(sgg: str) -> set[str]:
    return {r["code"] for r in db.client().table("regions").select("code").like("code", f"{sgg}%").execute().data}


def delete_before(cutoff: date) -> None:
    db.client().table("transactions").delete().eq("property_type", "apartment").lt("deal_date", cutoff.isoformat()).execute()


def run() -> None:
    api = _Api(os.environ["DATA_GO_KR_SERVICE_KEY"])
    months = parse_months(os.environ.get("TRANSACTIONS_MONTHS"))
    today = kst_today()
    # shortcut: 최근 months개월만 재수집하므로 그보다 오래된 거래의 해제 신고는 반영 안 됨, 필요하면 주 1회 12개월 재수집 추가
    yms = year_months(today, months)
    total, skipped, failures, dates = 0, {"unknown_region": 0, "duplicate": 0}, [], []
    for sgg in sigungu_codes():
        valid, n = region_codes(sgg), 0
        for ym in yms:
            try:
                rows, s = transform(fetch(api, sgg, ym), valid)
            except RuntimeError as e:
                failures.append(str(e))
                continue
            except ValueError:
                failures.append(f"{sgg} {ym}: ValueError")
                continue
            n += db.upsert_rows("transactions", rows, on_conflict="source_key")
            for k in skipped:
                skipped[k] += s[k]
            dates += [r["deal_date"] for r in rows]
        total += n
        print(f"{sgg}: {n} rows")
    first = year_months(today, RETENTION_MONTHS)[0]
    delete_before(date(int(first[:4]), int(first[4:]), 1))
    if failures:  # freshness를 갱신하지 않아 stale로 드러난다
        raise RuntimeError(f"transactions failed ({len(failures)}): " + ", ".join(failures[:10]))
    db.mark_freshness(DATASET, today, SOURCE,
                      f"{total} rows, months={months}, skipped={skipped}, max deal_date={max(dates, default=None)}")
    print(f"transactions: {total} rows")
