"""수도권 시군구 경계 SVG path 생성 (2단계 지도 선택용, 한 번 실행해 결과 JSON을 커밋한다).

원자료: 통계청 SGIS 행정동 경계(공공누리 제1유형), 가공 vuski/admdongkor (CC BY 4.0)
  curl -sLo adm.geojson https://raw.githubusercontent.com/vuski/admdongkor/master/ver20261001/HangJeongDong_ver20261001.geojson
  uv run --with shapely python scripts/build_sigungu_map.py adm.geojson "app/plans/[planId]/stage/2/_components/sigungu-map.json"
시군구 개편(구 신설 등)이 있으면 새 버전 파일로 다시 만든다. sgg 코드가 capital_sigungu.sigungu_code와 같아야 한다.
"""
import json, math, sys
from shapely.geometry import shape, MultiPolygon
from shapely.ops import unary_union

src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src))
groups = {}
for f in d["features"]:
    p = f["properties"]
    if p["sidonm"] in ("서울특별시", "인천광역시", "경기도"):
        groups.setdefault(p["sgg"], []).append(shape(f["geometry"]).buffer(0))

K = math.cos(math.radians(37.5))
geoms = {}
for code, gs in groups.items():
    g = unary_union(gs).simplify(0.002, preserve_topology=True)
    parts = list(g.geoms) if isinstance(g, MultiPolygon) else [g]
    big = max(parts, key=lambda x: x.area)
    # 작은 섬과 백령도 등 서해 먼바다 섬은 버린다(지도 폭이 2배로 늘어남). 가장 큰 조각은 남김
    parts = [x for x in parts if x is big or (x.area > 0.0004 and x.centroid.x > 126.3)]
    if big.centroid.x < 126.3:
        parts = [x for x in parts if x is not big] or [big]
    geoms[code] = parts

xs = [c[0] for ps in geoms.values() for p in ps for c in p.exterior.coords]
ys = [c[1] for ps in geoms.values() for p in ps for c in p.exterior.coords]
minx, maxy = min(xs), max(ys)
S = 1000 / ((max(xs) - minx) * K)
W, H = 1000, round((maxy - min(ys)) * S)

def pt(c):
    return f"{(c[0] - minx) * K * S:.1f} {(maxy - c[1]) * S:.1f}"

def ring(r):
    cs = list(r.coords)[:-1]
    return "M" + "L".join(pt(c) for c in cs) + "Z"

def box(codes):
    ps = [c for k in codes for p in geoms[k] for c in p.exterior.coords]
    a = [(c[0] - minx) * K * S for c in ps]; b = [(maxy - c[1]) * S for c in ps]
    m = 10
    return f"{min(a)-m:.0f} {min(b)-m:.0f} {max(a)-min(a)+2*m:.0f} {max(b)-min(b)+2*m:.0f}"

res = {"viewBox": f"0 0 {W} {H}", "sido": {
    "서울특별시": box([k for k in geoms if k.startswith("11")]),
    "인천광역시": box([k for k in geoms if k.startswith("28")]),
    "경기도": box([k for k in geoms if k.startswith("41")]),
}, "paths": {}, "labels": {}}
for code in sorted(geoms):
    # 시·도 확대 때 이름 위치와 폭(좁은 곳은 화면에서 이름을 생략)
    bg = max(geoms[code], key=lambda x: x.area)
    lp = bg.representative_point()
    res["labels"][code] = [round((lp.x - minx) * K * S), round((maxy - lp.y) * S), round((bg.bounds[2] - bg.bounds[0]) * K * S)]
    res["paths"][code] = "".join(ring(p.exterior) + "".join(ring(i) for i in p.interiors) for p in geoms[code])
json.dump(res, open(out, "w"), ensure_ascii=False, separators=(",", ":"))
print(len(res["paths"]), res["viewBox"])
