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


LINE_ALIASES = [("9호선", "9호선"), ("7호선", "7호선"), ("8호선", "8호선"), ("인천지하철 1호선", "인천1호선"),
                ("인천지하철 2호선", "인천2호선"), ("경부선", "1호선"), ("경원선", "1호선"), ("경인선", "1호선"),
                ("일산선", "3호선"), ("안산과천선", "4호선"), ("진접선", "4호선"), ("신림선", "신림선")]
NAME_ALIASES = {"서울": "서울역"}  # 역 접미사를 떼면 서울역만 의미가 사라진다


def squash(s: str) -> str:
    return " ".join(s.split())


def station_name(s: str) -> str:
    s = squash(s)
    s = s.removesuffix("역")
    return NAME_ALIASES.get(s, s)


def line_label(s: str) -> str:
    s = squash(s)
    # "1호선"은 경부선 등 다른 1호선 표기와 겹치지 않도록 단독 라벨은 그대로 둔다
    return next((to for key, to in LINE_ALIASES if key in s), s)


def valid_date(s: str) -> bool:
    try:
        date.fromisoformat(s)
        return True
    except ValueError:
        return False


def station_rows(rows: list[dict]) -> list[dict]:
    # 환승역이 이름·노선 표기 차이로 갈라지지 않도록 정규화하고, 같아진 행은 하나만 둔다
    ok = [d for r in rows if valid_date(d := r["data_date"])]
    fallback = max(ok) if ok else None  # 기준일이 비었거나 잘못된 행은 파일 안 최신 유효 기준일로 채운다
    out, seen = [], set()
    for r in rows:
        loc, name, line = point(r), station_name(r["name"]), line_label(r["line"])
        if not loc or (name, line) in seen or not (valid_date(r["data_date"]) or fallback):
            continue
        seen.add((name, line))
        out.append({"category": "subway_station", "name": name, "location": loc,
                    "attrs": {"line": line, "operator": squash(r["operator"]).removeprefix("서울특별시 ")},
                    "data_as_of": r["data_date"] if valid_date(r["data_date"]) else fallback,
                    "source": STATION_SRC, "source_id": r["station_id"]})
    return out


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
    as_of = max(date.fromisoformat(r["data_date"]) for r in raw if valid_date(r["data_date"]))
    db.mark_freshness(dataset, as_of, f"collector/data/{csv_name} ({src})", f"{n} rows")
    print(f"{dataset}: {n} rows, skipped {len(raw) - len(rows)}, deleted {len(gone)}")


def run() -> None:
    load("pois:subway_station", STATION_SRC, "subway_stations.csv", station_rows)
    load("pois:school", SCHOOL_SRC, "schools.csv", school_rows)
