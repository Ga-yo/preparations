import csv
from collections import Counter
from datetime import date
from pathlib import Path

from lib import db

CSV = Path(__file__).parent.parent / "data" / "regulated_areas.csv"


def transform(csv_rows: list[dict], name_to_code: dict[str, str]) -> list[dict]:
    missing = sorted({r["full_name"] for r in csv_rows if r["full_name"] not in name_to_code})
    if missing:
        raise ValueError(f"regions에 없는 지역명: {missing}")
    return [{
        "region_code": name_to_code[r["full_name"]], "area_type": r["area_type"],
        "effective_date": r["effective_date"], "end_date": r["end_date"] or None,
        "source": r["source"], "source_url": r["source_url"] or None, "note": r["note"] or None,
    } for r in csv_rows]


def run() -> None:
    with CSV.open(encoding="utf-8") as f:
        csv_rows = list(csv.DictReader(f))
    # 시도·시군구 단위 활성 코드. 수백 행이라 PostgREST 기본 1000행 제한 안쪽.
    res = (db.client().table("regions").select("code,full_name")
           .is_("eupmyeondong", "null").eq("is_active", True).execute())
    dup = {n for n, c in Counter(r["full_name"] for r in res.data).items() if c > 1}
    name_to_code = {r["full_name"]: r["code"] for r in res.data if r["full_name"] not in dup}  # 동명은 미해결로 둔다
    rows = transform(csv_rows, name_to_code)
    n = db.upsert_rows("regulated_areas", rows, on_conflict="region_code,area_type,effective_date")
    as_of = max(date.fromisoformat(r["effective_date"]) for r in csv_rows)
    db.mark_freshness("regulated_areas", as_of, "collector/data/regulated_areas.csv (국토교통부 지정 발표)", f"{n} rows")
    print(f"regulated_areas: {n} rows")
