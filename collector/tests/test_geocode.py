import json
from pathlib import Path

import pytest
import requests

from jobs import geocode

FIX = Path(__file__).parent / "fixtures"
OK = json.loads((FIX / "vworld_ok.json").read_text())
NOT_FOUND = json.loads((FIX / "vworld_not_found.json").read_text())
DONG = "1168010100"
KEY = "SECRET-KEY-123"


def test_to_query_strips_beonji():
    row = {"jibun_address": "서울특별시 강남구 역삼동 653-4번지", "road_address": "서울특별시 강남구 논현로 1"}
    assert geocode.to_query(row) == [("parcel", "서울특별시 강남구 역삼동 653-4"), ("road", "서울특별시 강남구 논현로 1")]
    assert geocode.to_query({**row, "road_address": None}) == [("parcel", "서울특별시 강남구 역삼동 653-4")]


def test_parse_point_ok():
    x, y = geocode.parse_point(OK, DONG)
    assert (round(x, 3), round(y, 3)) == (127.038, 37.508)


def test_rejects_point_in_other_dong():
    assert geocode.parse_point(OK, "1168010800") is None


def test_rejects_out_of_korea():
    bad = json.loads(json.dumps(OK))
    bad["response"]["result"]["point"] = {"x": "0", "y": "0"}
    assert geocode.parse_point(bad, DONG) is None


def test_malformed_ok_returns_none():
    no_refined = {"response": {"status": "OK", "result": {"point": {"x": "127", "y": "37"}}}}
    bad_num = json.loads(json.dumps(OK))
    bad_num["response"]["result"]["point"]["x"] = "abc"
    assert geocode.parse_point(no_refined, DONG) is None
    assert geocode.parse_point(bad_num, DONG) is None


def test_not_found_returns_none():
    assert geocode.parse_point(NOT_FOUND, DONG) is None


class FakeRpc:
    def __init__(self, data):
        self.data = data

    def range(self, a, b):
        return self

    def execute(self):
        return type("R", (), {"data": self.data})()


class FakeClient:
    def __init__(self, rows):
        self.rows, self.sets, self.missed = rows, [], []

    def rpc(self, name, args):
        if name == "complexes_missing_location":
            return FakeRpc(self.rows)
        if name == "mark_geocode_missed":
            self.missed += args["ids"]
            return FakeRpc(len(args["ids"]))
        self.sets.append(args)
        return FakeRpc(len(args["ids"]))


class Resp:
    def __init__(self, body, status=200):
        self.body, self.status_code = body, status

    def json(self):
        return self.body


def rows(n):
    return [{"id": i, "region_code": DONG, "jibun_address": f"서울특별시 강남구 역삼동 {i}번지", "road_address": None}
            for i in range(1, n + 1)]


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setenv("VWORLD_OPENAPI_KEY", KEY)
    monkeypatch.setenv("GEOCODE_SGG", "11680")
    monkeypatch.setattr(geocode.time, "sleep", lambda s: None)
    fresh = []
    monkeypatch.setattr(geocode.db, "mark_freshness", lambda *a: fresh.append(a))

    def setup(n, get):
        c = FakeClient(rows(n))
        monkeypatch.setattr(geocode.db, "client", lambda: c)
        monkeypatch.setattr(geocode.requests, "get", get)
        return c

    setup.fresh = fresh
    return setup


def test_stops_at_max_calls(env, monkeypatch, capsys):
    calls = []
    env(10, lambda *a, **k: calls.append(1) or Resp(NOT_FOUND))
    monkeypatch.setenv("GEOCODE_MAX_CALLS", "3")
    geocode.run()
    assert len(calls) == 3
    assert "remaining" in capsys.readouterr().out
    assert len(env.fresh) == 1


def test_failure_rate_skips_freshness(env):
    def boom(url, **k):
        raise requests.ConnectionError(f"{url}?key={KEY}")

    env(10, boom)
    with pytest.raises(SystemExit) as e:
        geocode.run()
    assert KEY not in str(e.value) and e.value.__context__ is None
    assert env.fresh == []


def test_batches_updates(env):
    c = env(450, lambda *a, **k: Resp(OK))
    geocode.run()
    assert [len(s["ids"]) for s in c.sets] == [200, 200, 50]
    assert len(env.fresh) == 1


def test_marks_not_found_as_missed(env):
    c = env(3, lambda *a, **k: Resp(NOT_FOUND))
    geocode.run()
    assert c.missed == [1, 2, 3] and c.sets == []


def test_null_jibun_address_marked_missed(env):
    calls = []
    c = env(2, lambda *a, **k: calls.append(1) or Resp(OK))
    for r in c.rows:
        r["jibun_address"] = None
    geocode.run()
    assert calls == [] and c.missed == [1, 2] and c.sets == []


def test_request_errors_are_not_marked(env):
    def boom(url, **k):
        raise requests.ConnectionError("x")

    c = env(3, boom)
    with pytest.raises(SystemExit):
        geocode.run()
    assert c.missed == []


def test_call_cap_cut_is_not_marked(env, monkeypatch, capsys):
    monkeypatch.setenv("GEOCODE_MAX_CALLS", "3")
    c = env(2, lambda *a, **k: Resp(NOT_FOUND))
    c.rows[1]["road_address"] = "서울특별시 강남구 논현로 1"
    c.rows[0]["road_address"] = "서울특별시 강남구 논현로 2"
    geocode.run()  # 1번 단지 2회, 2번 단지 1회 후 상한: 2번은 도로명 시도 전에 끊김
    assert c.missed == [1] and "remaining=1" in capsys.readouterr().out
