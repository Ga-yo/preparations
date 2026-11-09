"""국토교통부 건축물대장(건축HUB) 총괄표제부·표제부 → complexes. 실거래가 있는 지번의 공동주택만 적재한다.

API: https://apis.data.go.kr/1613000/BldRgstHubService/getBrRecapTitleInfo (총괄표제부, 법정동 단위)
     https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo (표제부, 총괄이 없는 지번만 bun/ji 지정)
PublicDataReader BuildingLedger는 timeout이 없고 페이지마다 30초를 기다리며(서버가 numOfRows를 100으로 자름)
실제로 빈 결과를 돌려줘서 requests로 직접 부른다. 응답은 XML(xmltodict). 2026-11-09 fixture로 확인한 형식:
bun/ji 4자리 0채움, useAprDay YYYYMMDD 또는 빈 값, 오래된 단지는 vlRat·bcRat·platArea·totPkngCnt가 0,
etcPurps는 '공동주택(아파트)'·'주거시설 근린생활시설'·빈 값 등 제각각이라 아파트 판별은 실거래 지번 일치로 한다.
서비스키가 URL 쿼리(serviceKey=)에 실리므로 예외는 법정동·예외 이름만 남긴다.
"""
import os
import time
import urllib.parse
from datetime import date

import pandas as pd
import requests
import xmltodict

from jobs.transactions import _int, _s, kst_today, parse_sigungu, sigungu_codes
from jobs.transactions import link_complexes as link
from lib import db

DATASET = "complexes:building_ledger"
SOURCE = "국토교통부 건축물대장 총괄표제부·표제부 (건축HUB BldRgstHubService)"
BASE = "https://apis.data.go.kr/1613000/BldRgstHubService/"
RECAP_EP, TITLE_EP = "getBrRecapTitleInfo", "getBrTitleInfo"
PAGE = 100  # 서버 상한
FETCH_TIMEOUT_S = 30
ATTEMPTS = 4  # 대기 1·2·4초
MAX_FAIL_RATIO = 0.01
SKIPS = ("not_housing", "no_transaction", "annex", "has_recap", "multi_title", "duplicate")
TX_FALLBACK_PAGE = 5000


def normalize_jibun(bun: str | None, ji: str | None) -> str | None:
    b, j = _int(bun), _int(ji) or 0
    if not b:
        return None
    return f"{b}-{j}" if j else str(b)


def split_jibun(jibun: str) -> tuple[str, str] | None:
    parts = jibun.split("-")
    if not all(p.isdigit() for p in parts) or len(parts) > 2:
        return None  # '산12' 같은 비대지 지번
    return parts[0].zfill(4), (parts[1] if len(parts) == 2 else "0").zfill(4)


def _num(v) -> float | None:
    # 대장의 0은 '값 없음'(오래된 단지)이라 0으로 저장하면 용적률 0%·대지지분 0으로 보인다
    s = _s(v)
    return float(s) if s and float(s) != 0 else None


def _ratio(v, max_pct: float) -> float | None:
    # 대장 원본에 오기(건폐율 1000% 이상 등)가 있다: 정의상 불가능한 값은 버린다(컬럼 numeric 한도 초과로 배치 전체가 실패함)
    n = _num(v)
    return n if n is not None and 0 < n <= max_pct else None


def _count(v) -> int | None:
    n = _int(v)
    return n or None


def _date(v) -> str | None:
    s = _s(v)
    return f"{s[:4]}-{s[4:6]}-{s[6:8]}" if s and len(s) == 8 and s.isdigit() else None


def _row(x: dict, region: str, jibun: str, today: date, title: bool) -> dict:
    if title:
        parking = sum(_int(x.get(k)) or 0 for k in ("indrAutoUtcnt", "oudrAutoUtcnt", "indrMechUtcnt", "oudrMechUtcnt"))
    else:
        parking = _int(x.get("totPkngCnt")) or 0
    return {
        "bldrgst_pk": _s(x["mgmBldrgstPk"]),
        "name": _s(x.get("bldNm")) or _s(x.get("newPlatPlc")) or _s(x.get("platPlc")) or jibun,
        "housing_type": "apartment", "region_code": region, "jibun": jibun,
        "jibun_address": _s(x.get("platPlc")), "road_address": _s(x.get("newPlatPlc")),
        "approval_date": _date(x.get("useAprDay")),
        "household_count": _count(x.get("hhldCnt")),
        "building_count": 1 if title else _count(x.get("mainBldCnt")),
        "parking_count": parking or None,
        "site_area_m2": _num(x.get("platArea")), "total_floor_area_m2": _num(x.get("totArea")),
        "floor_area_ratio": _ratio(x.get("vlRat"), 9999.99), "building_coverage_ratio": _ratio(x.get("bcRat"), 100),
        "data_as_of": today.isoformat(), "source": SOURCE,
    }


def transform(recap: pd.DataFrame, title: pd.DataFrame, lots: set[tuple[str, str]], today: date) -> tuple[list[dict], dict[str, int]]:
    rows: dict[str, dict] = {}
    skips = dict.fromkeys(SKIPS, 0)
    recap_lots: set[tuple[str, str]] = set()
    # 총괄 없이 주건축물이 여럿인 지번은 동마다 단지 행이 생겨 영구히 모호해지므로 받지 않는다
    mains = title[title.get("mainAtchGbCd", pd.Series(dtype=str)) == "0"] if len(title) else title
    title_count = pd.Series([(f"{_s(x.get('sigunguCd'))}{_s(x.get('bjdongCd'))}", normalize_jibun(x.get("bun"), x.get("ji")))
                             for x in mains.to_dict("records")]).value_counts().to_dict() if len(mains) else {}
    for is_title, df in ((False, recap), (True, title)):
        for x in df.to_dict("records"):
            region = f"{_s(x.get('sigunguCd'))}{_s(x.get('bjdongCd'))}"
            jibun = normalize_jibun(x.get("bun"), x.get("ji")) if _s(x.get("platGbCd")) == "0" else None
            if _s(x.get("mainPurpsCdNm")) != "공동주택":
                skips["not_housing"] += 1
            elif (region, jibun) not in lots:  # 실거래(아파트)가 있는 지번만: 연립·다세대·거래 없는 단지 제외
                skips["no_transaction"] += 1
            elif is_title and _s(x.get("mainAtchGbCd")) != "0":
                skips["annex"] += 1
            elif is_title and (region, jibun) in recap_lots:
                skips["has_recap"] += 1  # 총괄표제부가 있는 대지의 표제부는 같은 단지의 동
            elif is_title and title_count.get((region, jibun), 0) > 1:
                skips["multi_title"] += 1
            elif _s(x["mgmBldrgstPk"]) in rows:
                skips["duplicate"] += 1
            else:
                if not is_title:
                    recap_lots.add((region, jibun))
                rows[_s(x["mgmBldrgstPk"])] = _row(x, region, jibun, today, is_title)
    return list(rows.values()), skips


def fetch(key: str, ep: str, **params) -> pd.DataFrame:
    where = " ".join(params.get(k, "") for k in ("sigunguCd", "bjdongCd", "bun", "ji")).strip()
    items, page = [], 1
    try:
        while True:
            q = {"serviceKey": urllib.parse.unquote(key), "numOfRows": PAGE, "pageNo": page, **params}
            # 일시적 오류는 다시 시도: 끊김·5xx(실측 503)·200인데 빈 본문(실측 약 5~15%)
            for attempt in range(1, ATTEMPTS + 1):
                if attempt > 1:
                    time.sleep(2 ** (attempt - 2))
                try:
                    res = requests.get(BASE + ep, params=q, timeout=FETCH_TIMEOUT_S)
                except (requests.ConnectionError, requests.Timeout):
                    if attempt == ATTEMPTS:
                        raise
                    continue
                if res.status_code < 500 and res.text.strip():
                    break
            if res.status_code != 200:
                raise RuntimeError(f"{where}: HTTP {res.status_code}")
            if not res.text.strip():
                raise RuntimeError(f"{where}: empty response")
            body = xmltodict.parse(res.text).get("response", {})
            if body.get("header", {}).get("resultCode") != "00":
                raise RuntimeError(f"{where}: resultCode {body.get('header', {}).get('resultCode')}")
            it = ((body.get("body") or {}).get("items") or {}).get("item") or []
            items += it if isinstance(it, list) else [it]
            if page * PAGE >= int(body["body"]["totalCount"]):
                return pd.DataFrame(items)
            page += 1
    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"{where}: {type(e).__name__}") from None  # 원본 메시지에 서비스키가 든 URL이 있을 수 있다


def _transaction_lots_fallback(sgg: str) -> list[dict]:
    lo, hi, last_id = f"{sgg}00000", f"{sgg}99999", 0
    lots: dict[tuple[str, str], bool] = {}
    while True:
        q = (db.client().table("transactions").select("id,region_code,jibun,complex_id")
             .eq("property_type", "apartment")
             .gte("region_code", lo).lte("region_code", hi)
             .order("id").limit(TX_FALLBACK_PAGE))
        if last_id:
            q = q.gt("id", last_id)
        page = q.execute().data
        if not page:
            return [{"region_code": r, "jibun": j, "linked": linked} for (r, j), linked in sorted(lots.items())]
        for row in page:
            if not (jibun := row.get("jibun")):
                continue
            key = (row["region_code"], jibun)
            lots[key] = lots.get(key, False) or row["complex_id"] is not None
        last_id = page[-1]["id"]


def transaction_lots(sgg: str) -> list[dict]:
    out, start = [], 0
    try:
        while True:  # PostgREST 행 상한(기본 1000) 때문에 나눠 받는다
            page = db.client().rpc("transaction_lots", {"sgg": sgg}).range(start, start + 999).execute().data
            out += page
            if len(page) < 1000:
                return out
            start += 1000
    except Exception as e:
        if "statement timeout" not in str(e):
            raise
        print(f"::warning::transaction_lots timeout for {sgg}; fallback to direct transactions scan")
        return _transaction_lots_fallback(sgg)


def run() -> None:
    key = os.environ["DATA_GO_KR_SERVICE_KEY"]
    today = kst_today()
    total, calls, skipped, failures, linked, ambiguous = 0, 0, dict.fromkeys(SKIPS, 0), [], 0, 0
    for sgg in parse_sigungu(os.environ.get("COMPLEXES_SGG")) or sigungu_codes():
        lots = transaction_lots(sgg)
        lot_set = {(r["region_code"], r["jibun"]) for r in lots}
        recaps, failed_dongs = [], set()
        for dong in sorted({r["region_code"] for r in lots}):
            try:
                recaps.append(fetch(key, RECAP_EP, sigunguCd=dong[:5], bjdongCd=dong[5:]))
                calls += 1
            except RuntimeError as e:
                failures.append(str(e))
                failed_dongs.add(dong)  # 총괄 없이 표제부만 받으면 단지가 동별로 쪼개진다
        recap = pd.concat(recaps, ignore_index=True) if recaps else pd.DataFrame()
        covered = {(r["region_code"], r["jibun"]) for r in transform(recap, pd.DataFrame(), lot_set, today)[0]}
        titles = []
        # 이미 연결된 지번은 다시 묻지 않는다: 다음 실행부터는 남은 지번만 조회(증분)
        for r in lots:
            if (r["linked"] or r["region_code"] in failed_dongs or (r["region_code"], r["jibun"]) in covered
                    or not (bj := split_jibun(r["jibun"]))):
                continue
            try:
                titles.append(fetch(key, TITLE_EP, sigunguCd=r["region_code"][:5], bjdongCd=r["region_code"][5:],
                                    platGbCd="0", bun=bj[0], ji=bj[1]))
                calls += 1
            except RuntimeError as e:
                failures.append(str(e))
        title = pd.concat(titles, ignore_index=True) if titles else pd.DataFrame()
        rows, s = transform(recap, title, lot_set, today)
        n = db.upsert_rows("complexes", rows, on_conflict="bldrgst_pk")
        total += n
        for k in skipped:
            skipped[k] += s[k]
        # 시군구마다 연결: 실행이 중간에 끊겨도 다음 실행은 연결된 지번을 건너뛴다(백필이 누적된다)
        l, a = link(sgg)
        linked += l
        ambiguous += a
        print(f"{sgg}: {n} complexes, {len(lots)} lots, linked={l}, ambiguous={a}")
    print(f"complexes: {total} rows, {calls} calls, linked={linked}, ambiguous={ambiguous}")
    msg = f"complexes failed ({len(failures)}): " + ", ".join(failures[:10])
    # 산발적 503은 실패 지번이 미연결로 남아 다음 실행에서 다시 조회된다. 1%를 넘으면 장애로 보고 freshness를 갱신하지 않는다
    if len(failures) > MAX_FAIL_RATIO * (calls + len(failures)):
        raise RuntimeError(msg)
    if failures:
        print(f"::warning::{msg}")
    db.mark_freshness(DATASET, today, SOURCE,
                      f"{total} rows, {calls} calls, failed={len(failures)}, linked={linked}, ambiguous={ambiguous}, skipped={skipped}")
