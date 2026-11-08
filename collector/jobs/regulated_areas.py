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


KEY = ("region_code", "area_type", "effective_date")


def keys_to_delete(existing: list[dict], rows: list[dict]) -> list[tuple]:
    # CSV가 원본이다. CSV에서 빠진 행(지역명 교체 등)은 DB에서도 지운다.
    keep = {tuple(r[k] for k in KEY) for r in rows}
    return sorted({tuple(r[k] for k in KEY) for r in existing} - keep)


def run() -> None:
    with CSV.open(encoding="utf-8") as f:
        csv_rows = list(csv.DictReader(f))
    # CSV에 나온 이름만 조회(시군구·읍면동 단위 모두). 100행 미만이라 PostgREST 1000행 제한 안쪽.
    names = sorted({r["full_name"] for r in csv_rows})
    res = (db.client().table("regions").select("code,full_name")
           .in_("full_name", names).eq("is_active", True).execute())
    dup = {n for n, c in Counter(r["full_name"] for r in res.data).items() if c > 1}
    name_to_code = {r["full_name"]: r["code"] for r in res.data if r["full_name"] not in dup}  # 동명은 미해결로 둔다
    rows = transform(csv_rows, name_to_code)
    n = db.upsert_rows("regulated_areas", rows, on_conflict="region_code,area_type,effective_date")
    c = db.client()
    gone = keys_to_delete(c.table("regulated_areas").select(",".join(KEY)).execute().data, rows)
    for code, area_type, eff in gone:
        c.table("regulated_areas").delete().eq("region_code", code).eq("area_type", area_type).eq("effective_date", eff).execute()
    as_of = max(date.fromisoformat(r["effective_date"]) for r in csv_rows)
    db.mark_freshness("regulated_areas", as_of, "collector/data/regulated_areas.csv (국토교통부 지정 발표)", f"{n} rows")
    print(f"regulated_areas: {n} rows, deleted {len(gone)}")
