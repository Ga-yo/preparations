import pytest

from jobs import regulated_areas


def row(name):
    return {"full_name": name, "area_type": "adjustment_target", "effective_date": "2025-10-16",
            "end_date": "", "source": "s", "source_url": "", "note": ""}


def test_transform_resolves_code():
    out = regulated_areas.transform([row("서울특별시 강남구")], {"서울특별시 강남구": "1168000000"})
    assert out == [{"region_code": "1168000000", "area_type": "adjustment_target", "effective_date": "2025-10-16",
                    "end_date": None, "source": "s", "source_url": None, "note": None}]


def test_transform_unresolved_raises():
    with pytest.raises(ValueError, match="경기도 화성시 동탄구"):
        regulated_areas.transform([row("서울특별시 강남구"), row("경기도 화성시 동탄구")], {"서울특별시 강남구": "1168000000"})


def test_rows_missing_from_csv_are_deleted():
    # 화성시 일반구 신설로 옛 동 코드 행을 동탄구 한 줄로 바꾸면 옛 행은 DB에서 지워야 한다
    new = [{"region_code": "4159700000", "area_type": "adjustment_target", "effective_date": "2026-07-01"}]
    old = new + [{"region_code": "4159010700", "area_type": "adjustment_target", "effective_date": "2026-07-01"}]
    assert regulated_areas.keys_to_delete(old, new) == [("4159010700", "adjustment_target", "2026-07-01")]


def test_csv_resolves_against_current_regions():
    import csv
    names = {r["full_name"] for r in csv.DictReader(regulated_areas.CSV.open(encoding="utf-8"))}
    assert "경기도 화성시 동탄구" in names and not any(n.startswith("경기도 화성시 ") and n.endswith("동") for n in names)
