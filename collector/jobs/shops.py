"""생활 상가 수 (M6-D2): 소상공인시장진흥공단 상가(상권)정보 "행정동상가"(PublicDataReader SmallShop, divId=signguCd)로
시군구 상가 좌표를 받아 단지별 반경 500m 상가 수만 complexes.shop_count_500m에 넣는다. 상가 원본은 저장하지 않는다(원칙 11).
업종 코드표를 확인하지 못해 업종을 거르지 않고 모든 상가업소를 센다.
알려진 한계: 그 시군구 상가만 받으므로 시군구 경계 근처 단지는 실제보다 적게 나온다."""
import math
import os
from collections import defaultdict

import PublicDataReader as pdr
import requests
from PublicDataReader.PublicDataPortal import semas

from jobs.transactions import FETCH_TIMEOUT_S, kst_today, parse_sigungu, sigungu_codes
from lib import db

SOURCE = "소상공인시장진흥공단 상가(상권)정보 행정동 단위 상가업소 (PublicDataReader SmallShop)"
RADIUS_M = 500
PAGE_LIMIT = 99999  # 라이브러리가 numOfRows 99999 한 페이지만 받는다. 이만큼 오면 잘린 것으로 본다
EARTH_M = 6_371_000


class _TimeoutRequests:
    # PublicDataReader는 requests.get을 timeout 없이 부른다(transactions.py와 같은 이유)
    def __getattr__(self, name):
        return getattr(requests, name)

    @staticmethod
    def get(*args, **kwargs):
        return requests.get(*args, timeout=FETCH_TIMEOUT_S, **kwargs)


semas.requests = _TimeoutRequests()


def _dist(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * EARTH_M * math.asin(math.sqrt(a))


def count_within(complexes: list[tuple[int, float, float]], shops: list[tuple[float, float]], radius: float = RADIUS_M) -> dict[int, int]:
    # 반경 크기 격자에 상가를 넣고 단지 주변 3x3 칸만 거리 계산한다
    lat_cell = radius / 111_320
    lon_cell = radius / (111_320 * math.cos(math.radians(37.5)))  # 수도권 위도 기준. 칸이 조금 달라도 3x3이면 빠지지 않는다
    grid: dict[tuple[int, int], list[tuple[float, float]]] = defaultdict(list)
    for lon, lat in shops:
        grid[(int(lon // lon_cell), int(lat // lat_cell))].append((lon, lat))
    out = {}
    for cid, lon, lat in complexes:
        gx, gy = int(lon // lon_cell), int(lat // lat_cell)
        out[cid] = sum(1 for dx in (-1, 0, 1) for dy in (-1, 0, 1) for s in grid.get((gx + dx, gy + dy), ())
                       if _dist(lon, lat, s[0], s[1]) <= radius)
    return out


def shop_points(df) -> list[tuple[float, float]]:
    out = []
    for lon, lat in zip(df["lon"], df["lat"]):
        try:
            x, y = float(lon), float(lat)
        except (TypeError, ValueError):
            continue
        if 124 <= x <= 132 and 33 <= y <= 39:
            out.append((x, y))
    return out


def fetch(api, sgg: str):
    try:
        df = api.get_data("행정동상가", divId="signguCd", key=sgg, translate=False)  # 기본값은 lon/lat를 한글 열 이름으로 바꾼다
    except Exception as e:
        raise RuntimeError(f"{sgg}: {type(e).__name__}") from None  # 원본 메시지·URL에 서비스키가 있을 수 있다(원칙 8)
    if len(df) >= PAGE_LIMIT:
        raise RuntimeError(f"{sgg}: truncated at {PAGE_LIMIT} rows")
    return df


def complex_points(sgg: str) -> list[tuple[int, float, float]]:
    rows, start = [], 0
    while True:
        page = db.client().rpc("complex_points", {"sgg": sgg}).range(start, start + 999).execute().data
        rows += page
        if len(page) < 1000:
            return [(r["id"], r["lon"], r["lat"]) for r in rows]
        start += 1000


def run() -> None:
    api = pdr.SmallShop(os.environ["DATA_GO_KR_SERVICE_KEY"])
    failed, total = [], 0
    for sgg in parse_sigungu(os.environ.get("SHOPS_SGG")) or sigungu_codes():
        pts = complex_points(sgg)
        if not pts:
            continue  # 좌표가 없으면 셀 단지가 없다(geocode 먼저)
        try:
            counts = count_within(pts, shop_points(fetch(api, sgg)))
        except RuntimeError as e:
            failed.append(str(e))
            continue
        items = list(counts.items())
        for i in range(0, len(items), 500):
            chunk = items[i:i + 500]
            db.client().rpc("set_shop_counts", {"ids": [c[0] for c in chunk], "counts": [c[1] for c in chunk]}).execute()
        total += len(items)
        print(f"shops {sgg}: {len(items)} complexes")
    if failed:
        raise RuntimeError(f"shops failed: {', '.join(failed)}")  # 일부 실패면 기준일을 올리지 않는다
    db.mark_freshness("complexes:shops", kst_today(), SOURCE, f"{total} complexes")
