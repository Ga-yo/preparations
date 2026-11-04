"""금감원 금융상품통합비교공시 주택담보대출(은행권) 적재.

API 명세: https://finlife.fss.or.kr/finlife/api/houseMrtgApi/list.do?menuNo=700055
GET http://finlife.fss.or.kr/finlifeapi/mortgageLoanProductsSearch.json?auth=&topFinGrpNo=020000&pageNo=
응답 result.{baseList,optionList,max_page_no}; mrtg_type A=아파트, lend_rate_type F=고정 C=변동.
FSS_DUMMY=1 이면 API 대신 tests/fixtures/fss_mortgage_dummy.json(가짜 데이터)을 적재한다.
"""
import json
import os
from datetime import date, timedelta
from urllib.parse import urlparse
from pathlib import Path

import requests

from lib import db

URL = "http://finlife.fss.or.kr/finlifeapi/mortgageLoanProductsSearch.json"
DOC_URL = "https://finlife.fss.or.kr/finlife/api/houseMrtgApi/list.do?menuNo=700055"
SOURCE = "금융감독원 금융상품통합비교공시"
DUMMY_SOURCE = "DUMMY(테스트용 가짜 데이터)"
DUMMY_NOTE = "테스트용 가짜 데이터 — 실제 상품 아님"
DUMMY_FIXTURE = Path(__file__).parent.parent / "tests" / "fixtures" / "fss_mortgage_dummy.json"
RATE_TYPES = {"F": "fixed", "C": "variable"}


def check_dummy_allowed(supabase_url: str) -> None:
    if urlparse(supabase_url).hostname not in ("127.0.0.1", "localhost", "::1"):
        raise RuntimeError("FSS_DUMMY=1은 로컬 Supabase(127.0.0.1, localhost, [::1])에서만 허용됩니다")


def transform(payload: dict, as_of: date, dummy: bool = False) -> list[dict]:
    res = payload["result"]
    bases = {(b["fin_co_no"], b["fin_prdt_cd"]): b for b in res["baseList"]}
    groups: dict[tuple, list[dict]] = {}
    for o in res["optionList"]:
        if o["mrtg_type"] != "A" or o["lend_rate_type"] not in RATE_TYPES:
            continue  # 아파트 담보만
        if o["lend_rate_min"] is None or o["lend_rate_max"] is None:
            continue
        groups.setdefault((o["fin_co_no"], o["fin_prdt_cd"], RATE_TYPES[o["lend_rate_type"]]), []).append(o)
    out = []
    for (co, cd, rt), opts in groups.items():
        b = bases[(co, cd)]
        s = b["dcls_strt_day"]
        out.append({
            "source_key": f"{'dummy' if dummy else 'fss'}:{co}:{cd}:{rt}",
            "product_type": "bank", "provider": b["kor_co_nm"], "name": b["fin_prdt_nm"], "rate_type": rt,
            "rate_min": float(min(float(o["lend_rate_min"]) for o in opts)),
            "rate_max": float(max(float(o["lend_rate_max"]) for o in opts)),
            "effective_date": f"{s[:4]}-{s[4:6]}-{s[6:]}", "end_date": None, "data_as_of": as_of.isoformat(),
            "source": DUMMY_SOURCE if dummy else SOURCE, "source_url": DOC_URL,
            "note": DUMMY_NOTE if dummy else None,
        })
    return out


def keys_to_retire(existing: set[str], seen: set[str], dummy: bool) -> set[str]:
    # 실제 적재는 fss:* 미관측분 + dummy:* 전부 종료, 더미 적재는 dummy:* 미관측분만. policy:* 는 절대 안 건드림.
    if dummy:
        return {k for k in existing if k.startswith("dummy:") and k not in seen}
    return {k for k in existing if (k.startswith("fss:") and k not in seen) or k.startswith("dummy:")}


def fetch_all(key: str) -> dict:
    merged = {"result": {"baseList": [], "optionList": []}}
    page = 1
    while True:
        r = requests.get(URL, params={"auth": key, "topFinGrpNo": "020000", "pageNo": page}, timeout=30)
        if not r.ok:  # raise_for_status 메시지에는 auth=키가 담긴 URL이 들어간다
            raise RuntimeError(f"FSS API HTTP {r.status_code}")
        res = r.json()["result"]
        if res["err_cd"] != "000":
            raise RuntimeError(f"FSS API error {res['err_cd']}: {res['err_msg']}")
        merged["result"]["baseList"] += res["baseList"]
        merged["result"]["optionList"] += res["optionList"]
        if page >= int(res["max_page_no"]):
            return merged
        page += 1


def run() -> None:
    dummy = os.environ.get("FSS_DUMMY") == "1"
    today = date.today()
    if dummy:
        check_dummy_allowed(os.environ.get("SUPABASE_URL", ""))
        payload = json.loads(DUMMY_FIXTURE.read_text(encoding="utf-8"))
    else:
        key = os.environ.get("FSS_API_KEY")
        if not key:
            raise RuntimeError("FSS_API_KEY가 없습니다 (테스트용 가짜 데이터는 FSS_DUMMY=1)")
        payload = fetch_all(key)
    rows = transform(payload, today, dummy)
    if not rows:
        raise RuntimeError("변환 결과 0행 — 기존 상품을 종료하지 않고 중단")
    n = db.upsert_rows("loan_products", rows, on_conflict="source_key")
    c = db.client()
    existing = {r["source_key"] for r in c.table("loan_products").select("source_key")
                .or_("source_key.like.fss:*,source_key.like.dummy:*").is_("end_date", "null").execute().data}
    retire = keys_to_retire(existing, {r["source_key"] for r in rows}, dummy)
    if retire:
        c.table("loan_products").update({"end_date": (today - timedelta(days=1)).isoformat()}).in_("source_key", sorted(retire)).execute()
    db.mark_freshness("loan_products:bank", today, DUMMY_SOURCE if dummy else SOURCE, "dummy" if dummy else f"{n} rows")
    print(f"loan_products_fss: {n} rows, retired {len(retire)}{' (DUMMY)' if dummy else ''}")
