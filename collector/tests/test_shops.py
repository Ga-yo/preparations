import pandas as pd
import pytest

from jobs import shops


def test_count_within_radius():
    # 위도 37.5에서 경도 0.001도 약 88m
    complexes = [(1, 127.0, 37.5), (2, 127.1, 37.5)]
    pts = [(127.003, 37.5), (127.0055, 37.5), (127.006, 37.5), (126.9995, 37.5003)]
    assert shops.count_within(complexes, pts) == {1: 3, 2: 0}  # 약 264m·484m·55m 안, 528m 밖


def test_count_within_crosses_grid_cells():
    pts = [(127.0 + 0.0001 * i, 37.5) for i in range(-50, 51)]  # 약 ±440m
    assert shops.count_within([(1, 127.0, 37.5)], pts) == {1: 101}


def test_shop_points_drops_bad_rows():
    df = pd.DataFrame({"lon": ["127.0", "", "200", "127.1"], "lat": ["37.5", "37.5", "37.5", "x"]})
    assert shops.shop_points(df) == [(127.0, 37.5)]


class _Fail:
    def get_data(self, *a, **kw):
        raise Exception("https://apis.data.go.kr/x?serviceKey=SECRET")


class _Big:
    def get_data(self, *a, **kw):
        return pd.DataFrame({"lon": ["127"] * shops.PAGE_LIMIT, "lat": ["37.5"] * shops.PAGE_LIMIT})


def test_fetch_hides_url():
    with pytest.raises(RuntimeError) as e:
        shops.fetch(_Fail(), "11680")
    assert "SECRET" not in str(e.value) and e.value.__cause__ is None and "11680" in str(e.value)


def test_fetch_refuses_truncated_page():
    with pytest.raises(RuntimeError, match="truncated"):
        shops.fetch(_Big(), "11680")


class _Translating:
    # PublicDataReader SmallShop은 translate=True(기본)이면 lon/lat를 경도/위도로 바꾼다
    def get_data(self, *a, translate=True, **kw):
        cols = ("경도", "위도") if translate else ("lon", "lat")
        return pd.DataFrame({cols[0]: ["127.0"], cols[1]: ["37.5"]})


def test_fetch_keeps_original_column_names():
    assert shops.shop_points(shops.fetch(_Translating(), "11680")) == [(127.0, 37.5)]
