from jobs import parks


def pk(**kw):
    return {"park_id": "11680-00001", "name": "가공원", "kind": "근린공원", "lat": "37.5", "lon": "127.0",
            "area_m2": "12345.6", "address": "서울특별시 강남구 개포동 1", "data_date": "2026-06-22", **kw}


def test_park_rows():
    (r,) = parks.park_rows([pk()])
    assert r["category"] == "park" and r["source_id"] == "11680-00001" and r["source"] == parks.SRC
    assert r["location"] == "SRID=4326;POINT(127.0 37.5)"
    assert r["attrs"] == {"kind": "근린공원", "area_m2": 12345.6} and r["data_as_of"] == "2026-06-22"


def test_park_rows_skips_bad_coords_and_blank_area():
    rows = parks.park_rows([pk(), pk(park_id="2", lat="0"), pk(park_id="3", area_m2="")])
    assert [r["source_id"] for r in rows] == ["11680-00001", "3"]
    assert rows[1]["attrs"] == {"kind": "근린공원", "area_m2": None}
