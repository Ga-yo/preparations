import csv
from datetime import date
from pathlib import Path

from lib import db

DATA = Path(__file__).parent.parent / "data"
STATION_SRC = "국가철도공단 전국도시철도역사정보표준데이터"
SCHOOL_SRC = "한국교육시설안전원 전국초중등학교위치표준데이터"
LEVELS = {"초등학교": "elementary_school", "중학교": "middle_school", "고등학교": "high_school"}
OPEN = "운영"  # 원본 운영상태 값(전부 '운영'이지만 폐교 등이 생기면 거른다)


def point(r: dict) -> str | None:
    try:
        lat, lon = float(r["lat"]), float(r["lon"])
    except ValueError:
        return None
    # 경도 124~132, 위도 33~39 밖은 좌표 오류로 본다
    return f"SRID=4326;POINT({r['lon'].strip()} {r['lat'].strip()})" if 124 <= lon <= 132 and 33 <= lat <= 39 else None


def station_rows(rows: list[dict]) -> list[dict]:
    return [{"category": "subway_station", "name": r["name"], "location": loc,
             "attrs": {"line": r["line"], "operator": r["operator"]}, "data_as_of": r["data_date"],
             "source": STATION_SRC, "source_id": r["station_id"]} for r in rows if (loc := point(r))]


def school_rows(rows: list[dict]) -> list[dict]:
    return [{"category": LEVELS[r["level"]], "name": r["name"], "location": loc, "attrs": {"level": r["level"]},
             "data_as_of": r["data_date"], "source": SCHOOL_SRC, "source_id": r["school_id"]}
            for r in rows if r["level"] in LEVELS and r["status"] == OPEN and (loc := point(r))]


def keys_to_delete(existing: list[dict], rows: list[dict]) -> list[tuple]:
    # CSV가 원본이다. CSV에서 빠진 행은 DB에서도 지운다.
    keep = {(r["category"], r["source_id"]) for r in rows}
    return sorted({(r["category"], r["source_id"]) for r in existing} - keep)


def load(dataset: str, src: str, csv_name: str, build) -> None:
    with (DATA / csv_name).open(encoding="utf-8") as f:
        raw = list(csv.DictReader(f))
    rows = build(raw)
    n = db.upsert_rows("pois", rows, on_conflict="category,source,source_id")
    c = db.client()
    # 삭제는 이 job의 source 행만 대상으로 한다(다른 출처 pois를 건드리지 않음)
    existing = []
    while True:
        page = c.table("pois").select("category,source_id").eq("source", src).range(len(existing), len(existing) + 999).execute().data
        existing += page
        if len(page) < 1000:
            break
    gone = keys_to_delete(existing, rows)
    for cat, sid in gone:
        c.table("pois").delete().eq("source", src).eq("category", cat).eq("source_id", sid).execute()
    as_of = max(date.fromisoformat(r["data_date"]) for r in raw)
    db.mark_freshness(dataset, as_of, f"collector/data/{csv_name} ({src})", f"{n} rows")
    print(f"{dataset}: {n} rows, skipped {len(raw) - len(rows)}, deleted {len(gone)}")


def run() -> None:
    load("pois:subway_station", STATION_SRC, "subway_stations.csv", station_rows)
    load("pois:school", SCHOOL_SRC, "schools.csv", school_rows)
