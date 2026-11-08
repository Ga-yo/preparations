import json
from pathlib import Path

import pytest
import requests

from jobs import regions

# 행정안전부 법정동코드 API 실제 응답에서 고른 9행 (2026-11-09 수집)
BODY = json.loads((Path(__file__).parent / "fixtures" / "stanregincd_sample.json").read_text(encoding="utf-8"))


def rows_by_code():
    return {r["code"]: r for r in regions.transform(BODY["StanReginCd"][1]["row"])}


def test_transform_maps_codes_and_names():
    assert rows_by_code()["1111010100"] == {
        "code": "1111010100", "sido": "서울특별시", "sigungu": "종로구",
        "eupmyeondong": "청운동", "ri": None,
        "full_name": "서울특별시 종로구 청운동", "is_active": True,
    }


def test_ri_row():
    r = rows_by_code()["2671025021"]
    assert (r["sigungu"], r["eupmyeondong"], r["ri"]) == ("기장군", "기장읍", "동부리")
    assert r["full_name"] == "부산광역시 기장군 기장읍 동부리"


def test_sido_only_row_has_null_sigungu():
    r = rows_by_code()["1100000000"]
    assert r["sigungu"] is None and r["eupmyeondong"] is None and r["ri"] is None


def test_general_gu_keeps_city_and_gu_like_before():
    # 기존 목록 형식("수원시 장안구")과 같게: 2026년 신설된 화성시 동탄구
    rows = rows_by_code()
    assert (rows["4159711500"]["sigungu"], rows["4159711500"]["eupmyeondong"]) == ("화성시 동탄구", "여울동")
    assert (rows["4159700000"]["sigungu"], rows["4159700000"]["eupmyeondong"]) == ("화성시 동탄구", None)
    assert rows["4159000000"]["sigungu"] == "화성시"
    assert rows["2812510100"]["sigungu"] == "제물포구"


def test_sejong_has_no_sigungu():
    rows = rows_by_code()
    assert rows["3611000000"]["sigungu"] is None
    assert (rows["3611010100"]["sigungu"], rows["3611010100"]["eupmyeondong"]) == (None, "반곡동")


class Res:
    def __init__(self, body, status=200):
        self.body, self.status_code, self.ok = body, status, status == 200

    def json(self):
        return self.body


def page(rows, total, code="INFO-0"):
    return {"StanReginCd": [{"head": [{"totalCount": total}, {}, {"RESULT": {"resultCode": code}}]}, {"row": rows}]}


def test_fetch_all_pages_until_total(monkeypatch):
    calls = []
    pages = {1: page([{"region_cd": "1"}], 2), 2: page([{"region_cd": "2"}], 2)}

    def get(url, params, timeout):
        calls.append(params)
        return Res(pages[params["pageNo"]])
    monkeypatch.setattr(regions.requests, "get", get)
    assert [r["region_cd"] for r in regions.fetch_all("a%2Bb")] == ["1", "2"]
    assert calls[0]["ServiceKey"] == "a+b"  # 인코딩된 키를 풀어서 넘겨야 이중 인코딩이 안 된다


def test_fetch_all_hides_key_on_error(monkeypatch):
    def boom(url, params, timeout):
        raise requests.ConnectionError(f"{url}?ServiceKey={params['ServiceKey']}")
    monkeypatch.setattr(regions.requests, "get", boom)
    with pytest.raises(RuntimeError) as e:
        regions.fetch_all("SECRET")
    assert "SECRET" not in str(e.value) and e.value.__cause__ is None
    monkeypatch.setattr(regions.requests, "get", lambda url, params, timeout: Res(page([], 0, "ERROR-300")))
    with pytest.raises(RuntimeError, match="ERROR-300"):
        regions.fetch_all("SECRET")


def test_run_stops_before_writing_when_too_few_rows(monkeypatch):
    monkeypatch.setenv("DATA_GO_KR_SERVICE_KEY", "k")
    monkeypatch.setattr(regions, "fetch_all", lambda key: BODY["StanReginCd"][1]["row"])
    monkeypatch.setattr(regions.db, "upsert_rows", lambda *a, **k: pytest.fail("쓰면 안 된다"))
    with pytest.raises(RuntimeError, match="9행"):
        regions.run()


def test_codes_missing_from_api_are_retired():
    assert regions.codes_to_retire({"a", "b", "c"}, {"a", "d"}) == {"b", "c"}
