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
