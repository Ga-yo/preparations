"""행정안전부 법정동코드(StanReginCd) 적재 — 전국 현존 법정동.

API: https://apis.data.go.kr/1741000/StanReginCd/getStanReginCdList (공공데이터포털 15077871)
응답 {"StanReginCd": [{"head": [{totalCount}, {...}, {"RESULT": {resultCode}}]}, {"row": [...]}]}
현존 코드만 내려오므로 응답에 없는 기존 코드는 is_active=false로 돌린다(FK 때문에 지우지 않는다).
PublicDataReader 내장 목록은 2024-08 기준이라 2026년 화성시 일반구·인천 개편이 빠져 있었다.
"""
import os
from datetime import date
from urllib.parse import unquote

import requests

from lib import db

URL = "https://apis.data.go.kr/1741000/StanReginCd/getStanReginCdList"
SOURCE = "행정안전부 법정동코드 (StanReginCd)"
PAGE_SIZE = 1000
MIN_ROWS = 15000  # 전국 현존 약 2만 행. 이보다 적으면 비정상 응답으로 보고 폐지 처리 없이 멈춘다


def transform(items: list[dict]) -> list[dict]:
    rows = []
    for x in items:
        parts = x["locatadd_nm"].split()
        ri = parts[-1] if x["ri_cd"] != "00" else None
        emd = parts[-1 - (ri is not None)] if x["umd_cd"] != "000" else None
        middle = parts[1 : len(parts) - (emd is not None) - (ri is not None)]  # "화성시 동탄구"처럼 시+구
        rows.append({
            "code": x["region_cd"], "sido": parts[0], "sigungu": " ".join(middle) or None,
            "eupmyeondong": emd, "ri": ri, "full_name": " ".join(parts), "is_active": True,
        })
    return rows


def fetch_all(key: str) -> list[dict]:
    out, page = [], 1
    while True:
        # 포털 키는 이미 %인코딩돼 있어 그대로 params에 넣으면 이중 인코딩돼 "등록되지 않은 서비스키"가 된다
        params = {"ServiceKey": unquote(key), "type": "json", "pageNo": page, "numOfRows": PAGE_SIZE}
        try:
            r = requests.get(URL, params=params, timeout=30)
        except requests.RequestException as e:  # 예외 메시지에 서비스키가 든 URL이 들어간다
            raise RuntimeError(f"StanReginCd 요청 실패 ({type(e).__name__})") from None
        if not r.ok:
            raise RuntimeError(f"StanReginCd HTTP {r.status_code}")
        body = r.json()["StanReginCd"]
        head = body[0]["head"]
        if (code := head[2]["RESULT"]["resultCode"]) != "INFO-0":
            raise RuntimeError(f"StanReginCd error {code}")
        out += body[1]["row"] if len(body) > 1 else []
        if len(out) >= head[0]["totalCount"] or len(body) == 1:
            return out
        page += 1


def codes_to_retire(active: set[str], seen: set[str]) -> set[str]:
    return active - seen


def active_codes() -> set[str]:
    c, out, i = db.client(), set(), 0
    while True:  # PostgREST는 한 번에 1000행까지만 준다
        data = c.table("regions").select("code").eq("is_active", True).order("code").range(i, i + 999).execute().data
        out |= {r["code"] for r in data}
        if len(data) < 1000:
            return out
        i += 1000


def run() -> None:
    rows = transform(fetch_all(os.environ["DATA_GO_KR_SERVICE_KEY"]))
    if len(rows) < MIN_ROWS:
        raise RuntimeError(f"법정동코드 {len(rows)}행 — 비정상으로 적어 기존 코드를 건드리지 않고 중단")
    n = db.upsert_rows("regions", rows, on_conflict="code")  # upsert only: FK 참조 유지
    retire = sorted(codes_to_retire(active_codes(), {r["code"] for r in rows}))
    c = db.client()
    for i in range(0, len(retire), 200):
        c.table("regions").update({"is_active": False}).in_("code", retire[i : i + 200]).execute()
    db.mark_freshness("regions", date.today(), SOURCE, f"{n} rows, retired {len(retire)}")
    print(f"regions: {n} rows, retired {len(retire)}")
