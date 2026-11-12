"""VWorld 지오코더(getcoord)로 complexes 좌표를 채운다. 좌표 없는 단지만 대상으로 하는 증분 작업.

API: GET https://api.vworld.kr/req/address (type=parcel|road). 2026-11-12 fixture로 확인한 응답:
OK는 result.point.{x,y}(문자열 경도·위도)와 refined.structure.level4LC(법정동코드+지번 19자리), 미발견은 status=NOT_FOUND,
오류는 status=ERROR + error.code. 키가 URL 쿼리(key=)에 실리므로 예외는 단지 id·예외 이름·상태코드만 남긴다.
"""
import os
import time

import requests

from jobs.transactions import kst_today, parse_sigungu, sigungu_codes
from lib import db

DATASET = "complexes:location"
SOURCE = "VWorld 지오코더 API 2.0 (getcoord)"
URL = "https://api.vworld.kr/req/address"
BATCH = 200
ATTEMPTS = 3  # 재시도 대기 1·2초
MAX_FAIL_RATIO = 0.01


def to_query(row: dict) -> list[tuple[str, str]]:
    out = [("parcel", row["jibun_address"].removesuffix("번지"))]
    if row.get("road_address"):
        out.append(("road", row["road_address"]))
    return out


def parse_point(resp: dict, region_code: str) -> tuple[float, float] | None:
    r = resp["response"]
    if r["status"] != "OK":
        return None
    # 동명 지번·정제 실패로 엉뚱한 동 좌표가 오는 것을 막는다
    if r["refined"]["structure"]["level4LC"][:10] != region_code[:10]:
        return None
    x, y = float(r["result"]["point"]["x"]), float(r["result"]["point"]["y"])
    return (x, y) if 124 <= x <= 132 and 33 <= y <= 39 else None


def geocode(key: str, typ: str, address: str) -> dict:
    params = dict(service="address", request="getcoord", version="2.0", crs="epsg:4326", type=typ,
                  format="json", refine="true", simple="false", address=address, key=key)
    try:
        for attempt in range(ATTEMPTS):
            if attempt:
                time.sleep(attempt)
            try:
                res = requests.get(URL, params=params, timeout=10)
            except (requests.ConnectionError, requests.Timeout):
                if attempt == ATTEMPTS - 1:
                    raise
                continue
            if res.status_code < 500:
                break
        if res.status_code != 200:
            raise RuntimeError(f"HTTP {res.status_code}")
        body = res.json()
        if body["response"]["status"] == "ERROR":
            raise RuntimeError(f"VWorld {body['response']['error']['code']}")
        return body
    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(type(e).__name__) from None  # 원본 메시지에 키가 든 URL이 있을 수 있다


def missing(sgg: str) -> list[dict]:
    out, start = [], 0
    while True:  # PostgREST 행 상한(기본 1000) 때문에 나눠 받는다
        page = db.client().rpc("complexes_missing_location", {"sgg": sgg}).range(start, start + 999).execute().data
        out += page
        if len(page) < 1000:
            return out
        start += 1000


def flush(found: list[tuple[int, float, float]]) -> None:
    if found:
        db.client().rpc("set_complex_locations", {"ids": [f[0] for f in found], "lons": [f[1] for f in found],
                                                  "lats": [f[2] for f in found]}).execute()
        found.clear()


def run() -> None:
    key = os.environ["VWORLD_OPENAPI_KEY"]
    max_calls = int(os.environ.get("GEOCODE_MAX_CALLS") or 3000)
    today = kst_today()
    calls, targets, saved, not_found, failures, remaining = 0, 0, 0, 0, [], 0
    for sgg in parse_sigungu(os.environ.get("GEOCODE_SGG")) or sigungu_codes():
        todo, found = missing(sgg), []
        for i, row in enumerate(todo):
            if calls >= max_calls:
                remaining += len(todo) - i
                break
            targets += 1
            hit = False
            for typ, addr in to_query(row):
                if calls >= max_calls:
                    break
                calls += 1
                try:
                    point = parse_point(geocode(key, typ, addr), row["region_code"])
                except RuntimeError as e:
                    failures.append(f"complex {row['id']}: {e}")
                    continue
                if point:
                    found.append((row["id"], *point))
                    hit = True
                    break
            not_found += not hit
            if len(found) >= BATCH:
                saved += len(found)
                flush(found)
        saved += len(found)
        flush(found)
        print(f"{sgg}: {len(todo)} targets")
    note = f"saved={saved}, not_found={not_found}, calls={calls}, failed={len(failures)}, remaining={remaining}"
    print(f"geocode: {note}")
    if len(failures) > MAX_FAIL_RATIO * targets:
        # 좌표는 이미 적재됐고 실패 단지는 다음 실행에서 다시 대상이 된다. 장애로 보고 freshness는 갱신하지 않는다
        raise SystemExit(f"geocode failed ({len(failures)}): " + ", ".join(failures[:10]))
    if failures:
        print(f"::warning::geocode failed ({len(failures)}): " + ", ".join(failures[:10]))
    db.mark_freshness(DATASET, today, SOURCE, note)
