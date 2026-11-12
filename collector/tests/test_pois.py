from jobs import pois


def st(**kw):
    return {"station_id": "서울 도시철도 2호선:강남", "name": "강남", "line": "서울 도시철도 2호선", "operator": "서울교통공사",
            "lat": "37.4979", "lon": "127.0276", "road_address": "서울특별시 강남구", "data_date": "2021-04-09", **kw}


def sc(**kw):
    return {"school_id": "B1", "name": "가초", "level": "초등학교", "status": "운영", "lat": "37.5", "lon": "127.0",
            "jibun_address": "서울특별시 강남구", "data_date": "2026-10-01", **kw}


def test_station_rows():
    (r,) = pois.station_rows([st()])
    assert r["category"] == "subway_station" and r["source_id"] == "서울 도시철도 2호선:강남"
    assert r["location"] == "SRID=4326;POINT(127.0276 37.4979)"  # lon lat 순서
    assert r["attrs"] == {"line": "서울 도시철도 2호선", "operator": "서울교통공사"} and r["data_as_of"] == "2021-04-09"


def test_school_levels_mapped():
    rows = pois.school_rows([sc(level="초등학교"), sc(school_id="B2", level="중학교"), sc(school_id="B3", level="고등학교"),
                             sc(school_id="B4", level="특수학교")])
    assert [r["category"] for r in rows] == ["elementary_school", "middle_school", "high_school"]
    assert rows[0]["attrs"] == {"level": "초등학교"}


def test_closed_school_skipped():
    assert pois.school_rows([sc(status="폐교")]) == []


def test_bad_coordinates_skipped():
    bad = [st(lat=""), st(lon="abc"), st(lat="10", lon="127"), st(lat="37", lon="140")]
    assert pois.station_rows(bad) == [] and pois.school_rows([sc(lat="", lon="")]) == []


def test_run_deletes_missing():
    old = [{"category": "subway_station", "source_id": "a"}, {"category": "subway_station", "source_id": "b"}]
    new = [{"category": "subway_station", "source_id": "a"}]
    assert pois.keys_to_delete(old, new) == [("subway_station", "b")]
