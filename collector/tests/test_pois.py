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


def test_station_name_normalised():
    assert [r["name"] for r in pois.station_rows([st(station_id="a", name="선릉역"), st(station_id="b", name="서울", line="x"),
                                                  st(station_id="c", name=" 강남  구청역 ", line="y")])] == ["선릉", "서울역", "강남 구청"]


def test_line_labels_canonical():
    lines = ["서울 도시철도 9호선", "수도권  도시철도 9호선", "도시철도 7호선", "7호선", "수도권 광역철도 8호선", "인천지하철 1호선",
             "인천지하철 2호선", "분당선"]
    rows = pois.station_rows([st(station_id=str(i), line=ln, name=str(i)) for i, ln in enumerate(lines)])
    assert [r["attrs"]["line"] for r in rows] == ["9호선", "9호선", "7호선", "7호선", "8호선", "인천1호선", "인천2호선", "분당선"]


def test_normalised_duplicates_dropped():
    rows = pois.station_rows([st(station_id="a", name="선릉역"), st(station_id="b", name="선릉")])
    assert [r["source_id"] for r in rows] == ["a"]


def test_invalid_date_falls_back_to_max_valid():
    rows = pois.station_rows([st(station_id="a", data_date=""), st(station_id="b", name="x", data_date="2025-01-02"),
                              st(station_id="c", name="y", data_date="2024-01-02")])
    assert [r["data_as_of"] for r in rows] == ["2025-01-02"] * 2 + ["2024-01-02"]
