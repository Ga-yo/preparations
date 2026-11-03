from pathlib import Path

import pandas as pd

from jobs import regions

FIXTURE = Path(__file__).parent / "fixtures" / "bdong_sample.csv"


def rows_by_code():
    return {r["code"]: r for r in regions.transform(pd.read_csv(FIXTURE, dtype=str))}


def test_transform_maps_codes_and_names():
    r = rows_by_code()["1111010100"]
    assert len(r["code"]) == 10 and r["full_name"].startswith("서울특별시 ")
    assert r == {
        "code": "1111010100", "sido": "서울특별시", "sigungu": "종로구",
        "eupmyeondong": "청운동", "ri": None,
        "full_name": "서울특별시 종로구 청운동", "is_active": True,
    }


def test_ri_included_in_full_name():
    r = rows_by_code()["2671025021"]
    assert r["ri"] == "동부리"
    assert r["full_name"] == "부산광역시 기장군 기장읍 동부리"


def test_abolished_code_inactive():
    rows = rows_by_code()
    assert rows["1111090100"]["is_active"] is False  # 말소일자 있음
    assert rows["1111010100"]["is_active"] is True


def test_sido_only_row_has_null_sigungu():
    r = rows_by_code()["1100000000"]
    assert r["sigungu"] is None and r["eupmyeondong"] is None and r["ri"] is None
    assert r["full_name"] == "서울특별시"
