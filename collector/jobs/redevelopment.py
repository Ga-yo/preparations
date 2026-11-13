"""서울 정비사업 추진현황(서울 열린데이터광장 OA-22856)을 redevelopment_projects에 적재하고 단지와 지번으로 매칭한다.

collector/data/seoul_redevelopment.csv는 원본 xlsx에서 필요한 컬럼만 추린 파일이다(data/README.md).
단지 매칭은 (법정동 코드, 지번)이 단지 하나와 정확히 같을 때만 한다(M5-D11). 법정동 코드는 regions 테이블에서 찾는다(원칙 5).
"""
import csv
import re
from collections import defaultdict
from datetime import date
from pathlib import Path

from lib import db

DATA = Path(__file__).parent.parent / "data"
CSV_NAME = "seoul_redevelopment.csv"
DATASET = "redevelopment:seoul"
SRC = "서울특별시 정비사업 추진현황 (서울 열린데이터광장 OA-22856)"
SRC_URL = "https://data.seoul.go.kr/dataList/OA-22856/F/1/datasetView.do"
AS_OF = date(2026, 6, 30)  # 파일명 "26년 6월말 기준". 새 파일로 바꾸면 함께 고친다

STAGES = {"구역지정": "정비구역지정", "추진위": "추진위", "조합설립": "조합설립", "건축심의": "건축심의",
          "사업시행": "사업시행인가", "관리처분": "관리처분인가", "착공": "착공"}
# 단계별 일자 열: 변경(최종)이 있으면 그 값, 없으면 최초
STAGE_DATES = {"정비구역지정": ("d_zone_last", "d_zone"), "추진위": ("d_committee",), "조합설립": ("d_union",),
               "건축심의": ("d_review",), "사업시행인가": ("d_permit_last", "d_permit"),
               "관리처분인가": ("d_mgmt_last", "d_mgmt"), "착공": ("d_start",)}


def stage_of(raw: str) -> str | None:
    return STAGES.get(raw.strip())


def project_type_of(raw: str) -> str | None:
    return "reconstruction" if "재건축" in raw else "redevelopment" if "재개발" in raw else None


def _jibun(s: str) -> str | None:
    parts = s.split("-")
    if len(parts) > 2 or not all(p.isdigit() for p in parts):
        return None  # 산 번지 등
    b, j = int(parts[0]), int(parts[1]) if len(parts) == 2 else 0
    return (f"{b}-{j}" if j else str(b)) if b else None  # complexes.normalize_jibun과 같은 표기


def parse_location(gu: str, loc: str) -> tuple[str, str] | None:
    s = "".join(loc.split(",")[0].split())  # 첫 지번만
    s = s.removeprefix(gu)  # 그 행의 자치구 이름일 때만 뗀다(정규식으로 '…구'를 떼면 '압구정동'이 깨진다)
    s = re.sub(r"(번지)?(일대|일원|외\d+)?$", "", s)  # 248번지일대, 591-1외5 같은 꼬리
    # 동 이름 바로 뒤가 숫자일 때만 끊는다('북가좌동'을 '북가'에서 자르지 않는다)
    m = re.match(r"^([가-힣]+?\d*(?:동\d+가|로\d+가|동|가))(산?\d.*)$", s)
    if not m:
        return None
    dong, rest = m.groups()
    if not dong.endswith("가"):
        dong = re.sub(r"(?<=.)(\d+|본)동$", "동", dong)  # 중곡4동·망우본동(행정동 표기) → 중곡동·망우동
    j = _jibun(rest)
    return (dong, j) if j else None


def match_complex(region_code: str | None, jibun: str, lots: dict[tuple[str, str], list[int]]) -> int | None:
    ids = lots.get((region_code, jibun), []) if region_code else []
    return ids[0] if len(ids) == 1 else None


def _valid(s: str) -> bool:
    try:
        date.fromisoformat(s)
        return True
    except ValueError:
        return False


def stage_date(r: dict, stage: str) -> str | None:
    return next((r[k] for k in STAGE_DATES[stage] if _valid(r.get(k, ""))), None)


def project_rows(raw: list[dict], regions: dict[tuple[str, str], str], lots: dict[tuple[str, str], list[int]]) -> list[dict]:
    out = []
    for r in raw:
        stage, ptype = stage_of(r["stage"]), project_type_of(r["project_type"])
        if not stage or not ptype:
            continue
        loc = parse_location(r["gu"], r["jibun_address"])
        region = regions.get((r["gu"], loc[0])) if loc else None
        cid = match_complex(region, loc[1], lots) if loc else None
        out.append({
            "source_key": r["code"], "name": r["zone_name"], "project_type": ptype, "stage": stage,
            "stage_date": stage_date(r, stage), "region_code": region, "complex_id": cid,
            "match_method": "jibun" if cid else "none", "address": r["jibun_address"] or None,
            "data_as_of": AS_OF.isoformat(), "source": SRC, "source_url": SRC_URL,
        })
    return out


def guard_rows(n_rows: int, n_existing: int) -> None:
    # 빈 CSV나 단계 값 이름이 바뀐 파일로 전체 구역을 지우고 "정비구역 아님"을 보이지 않도록 멈춘다
    if n_rows == 0 or n_rows < n_existing / 2:
        raise SystemExit(f"{DATASET}: {n_rows} rows parsed vs {n_existing} existing — CSV를 확인하세요(적재·삭제하지 않음)")


def keys_to_delete(existing: list[str], rows: list[dict]) -> list[str]:
    # CSV가 원본이다. CSV에서 빠진 구역은 DB에서도 지운다.
    return sorted(set(existing) - {r["source_key"] for r in rows})


def _all(c, table: str, cols: str, build) -> list:
    out, n = [], 0
    while True:
        q = build(c.table(table).select(cols)).range(n, n + 999).execute().data
        out += q
        n += len(q)
        if len(q) < 1000:
            return out


def run() -> None:
    with (DATA / CSV_NAME).open(encoding="utf-8") as f:
        raw = list(csv.DictReader(f))
    c = db.client()
    regions = {}
    for g in _all(c, "regions", "code, full_name", lambda q: q.like("full_name", "서울특별시 %").eq("is_active", True)):
        p = g["full_name"].split()
        if len(p) == 3:
            regions[(p[1], p[2])] = g["code"]
    lots: dict[tuple[str, str], list[int]] = defaultdict(list)
    for x in _all(c, "complexes", "id, region_code, jibun", lambda q: q.like("region_code", "11%").not_.is_("jibun", "null")):
        lots[(x["region_code"], x["jibun"])].append(x["id"])
    rows = project_rows(raw, regions, lots)
    existing = [x["source_key"] for x in _all(c, "redevelopment_projects", "source_key", lambda q: q)]
    guard_rows(len(rows), len(existing))
    n = db.upsert_rows("redevelopment_projects", rows, on_conflict="source_key")
    gone = keys_to_delete(existing, rows)
    for k in gone:
        c.table("redevelopment_projects").delete().eq("source_key", k).execute()
    db.mark_freshness(DATASET, AS_OF, f"collector/data/{CSV_NAME} ({SRC})", f"{n} rows")
    matched = sum(1 for r in rows if r["complex_id"])
    no_region = sum(1 for r in rows if not r["region_code"])
    print(f"{DATASET}: {n} rows, skipped {len(raw) - len(rows)}, matched {matched}, no_region {no_region}, deleted {len(gone)}")
