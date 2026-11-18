"""도시공원 POI (M6-D2): 전국도시공원정보표준데이터(data.go.kr 15012890) 파일에서 추린 collector/data/parks.csv를
pois(category='park')로 적재한다. 추린 규칙은 collector/data/README.md. CSV에서 빠진 공원은 DB에서 지운다."""
from jobs.pois import load, point

SRC = "전국도시공원정보표준데이터"


def _area(s: str) -> float | None:
    try:
        return float(s)
    except ValueError:
        return None


def park_rows(rows: list[dict]) -> list[dict]:
    return [{"category": "park", "name": r["name"], "location": loc, "attrs": {"kind": r["kind"], "area_m2": _area(r["area_m2"])},
             "data_as_of": r["data_date"], "source": SRC, "source_id": r["park_id"]}
            for r in rows if (loc := point(r))]


def run() -> None:
    load("pois:park", SRC, "parks.csv", park_rows)
