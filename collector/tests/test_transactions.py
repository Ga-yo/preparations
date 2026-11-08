import re
from datetime import date
from pathlib import Path

import pandas as pd
import pytest
import requests

from jobs import transactions

FIXTURE = Path(__file__).parent / "fixtures" / "molit_apt_trade_sample.csv"

# 필드명은 PublicDataReader 1.1.1.post2 TransactionPrice meta_dict("아파트","매매") 기준. 값은 합성.
BASE = {
    "sggCd": "11680", "umdCd": "10300", "jibun": "12", "aptSeq": "11680-123", "aptNm": " 개포자이 ", "aptDong": "",
    "excluUseAr": "84.97", "dealYear": "2025", "dealMonth": "10", "dealDay": "3", "dealAmount": "250,000",
    "floor": "12", "buildYear": "2018", "cdealType": "", "cdealDay": "", "dealingGbn": "중개거래",
}
VALID = {"1168010300", "1168010400"}


def frame(*rows: dict) -> pd.DataFrame:
    return pd.DataFrame([{**BASE, **r} for r in rows])


def test_parse_months():
    assert transactions.parse_months(None) == 2 and transactions.parse_months("24") == 24
    for bad in ("0", "25", "abc", "1.5", ""):
        with pytest.raises(ValueError):
            transactions.parse_months(bad)


def test_year_months_crosses_year():
    assert transactions.year_months(date(2026, 2, 10), 3) == ["202512", "202601", "202602"]


def test_transform_maps_fields():
    rows, skips = transactions.transform(frame({}), VALID)
    assert rows == [{
        "source_key": transactions.source_key(BASE), "property_type": "apartment", "region_code": "1168010300",
        "building_name": "개포자이", "jibun": "12", "exclusive_area": 84.97, "floor": 12, "deal_amount": 2_500_000_000,
        "deal_date": "2025-10-03", "build_year": 2018, "deal_type": "중개거래", "cancel_date": None,
    }]
    assert skips == {"unknown_region": 0, "duplicate": 0}


def test_transform_accepts_typed_values_from_get_data():
    # get_data는 정수 컬럼을 Int64, 면적을 float로, 나머지를 str로 바꾸며 결측 문자열은 'nan'/'None'이 된다
    df = frame({"dealAmount": 250000, "floor": pd.NA, "excluUseAr": 84.97, "jibun": "nan", "dealingGbn": "None"})
    df["dealAmount"] = df["dealAmount"].astype("Int64")
    df["floor"] = df["floor"].astype("Int64")
    r = transactions.transform(df, VALID)[0][0]
    assert (r["deal_amount"], r["floor"], r["jibun"], r["deal_type"]) == (2_500_000_000, None, None, None)


def test_cancelled_row_has_cancel_date():
    r = transactions.transform(frame({"cdealType": "O", "cdealDay": "25.11.01"}), VALID)[0][0]
    assert r["cancel_date"] == "2025-11-01"


def test_unexpected_cancel_format_raises():
    # 실제 응답 확인 전 형식 가정: 다르면 조용히 틀리지 않고 실패한다
    with pytest.raises(ValueError):
        transactions.transform(frame({"cdealType": "O", "cdealDay": "20251101"}), VALID)


def test_source_key_stable_under_cancellation():
    assert transactions.source_key(BASE) == transactions.source_key({**BASE, "cdealType": "O", "cdealDay": "25.11.01"})
    assert transactions.source_key(BASE) != transactions.source_key({**BASE, "floor": "13"})
    assert transactions.source_key(BASE) == transactions.source_key({**BASE, "dealAmount": 250000, "aptNm": "개포자이"})
    assert re.fullmatch(r"apt:[0-9a-f]{20}", transactions.source_key(BASE))


def test_duplicate_keys_collapsed():
    rows, skips = transactions.transform(frame({}, {}), VALID)
    assert len(rows) == 1 and skips["duplicate"] == 1


def test_unknown_region_skipped():
    rows, skips = transactions.transform(frame({}, {"umdCd": "99999", "floor": "3"}, {"umdCd": "", "floor": "4"}), VALID)
    assert len(rows) == 1 and skips["unknown_region"] == 2


def test_http_error_is_not_empty_result():
    class Res:
        status_code = 403
        text = ""
    with pytest.raises(transactions.HttpStatusError):
        transactions._Api("k")._response_to_item_data(Res(), "아파트", "매매", "11680", "202510")


class FakeApi:
    def __init__(self, key):
        assert key == "SECRET"

    def get_data(self, property_type, trade_type, sigungu_code, year_month=None, translate=True):
        assert (property_type, trade_type, translate) == ("아파트", "매매", False)
        if sigungu_code == "11650":
            raise requests.ConnectionError("http://apis.data.go.kr/x?serviceKey=SECRET&LAWD_CD=11650")
        if sigungu_code == "11710":
            raise transactions.HttpStatusError(403)
        return frame({})


@pytest.fixture
def fake_run(monkeypatch):
    calls = {"upsert": [], "fresh": [], "delete": []}
    monkeypatch.setenv("DATA_GO_KR_SERVICE_KEY", "SECRET")
    monkeypatch.setenv("TRANSACTIONS_MONTHS", "1")
    monkeypatch.setattr(transactions, "_Api", FakeApi)
    monkeypatch.setattr(transactions, "region_codes", lambda sgg: VALID)
    monkeypatch.setattr(transactions, "delete_before", lambda cutoff: calls["delete"].append(cutoff))
    monkeypatch.setattr(transactions.db, "upsert_rows", lambda t, rows, on_conflict: calls["upsert"].append((t, rows, on_conflict)) or len(rows))
    monkeypatch.setattr(transactions.db, "mark_freshness", lambda *a, **k: calls["fresh"].append(a))
    return calls


def test_run_continues_and_skips_freshness_on_failure(monkeypatch, fake_run):
    monkeypatch.setattr(transactions, "sigungu_codes", lambda: ["11680", "11650", "11710"])
    with pytest.raises(RuntimeError) as e:
        transactions.run()
    msg = str(e.value)
    assert [c[0] for c in fake_run["upsert"]] == ["transactions"] and fake_run["upsert"][0][2] == "source_key"
    assert "11650" in msg and "ConnectionError" in msg and "11710" in msg and "HTTP 403" in msg
    assert "SECRET" not in msg and "serviceKey" not in msg
    assert e.value.__cause__ is None and e.value.__context__ is None
    assert fake_run["fresh"] == []


def test_run_marks_freshness_on_success(monkeypatch, fake_run):
    monkeypatch.setattr(transactions, "sigungu_codes", lambda: ["11680"])
    transactions.run()
    assert len(fake_run["fresh"]) == 1 and fake_run["fresh"][0][0] == "transactions:apartment"
    assert fake_run["fresh"][0][1] == transactions.kst_today()
    assert len(fake_run["delete"]) == 1 and fake_run["delete"][0].day == 1


@pytest.mark.skipif(not FIXTURE.exists(), reason="실제 응답 fixture 미캡처(활용신청 승인 대기)")
def test_real_fixture_transforms():
    df = pd.read_csv(FIXTURE, dtype=str)
    valid = {f"{x.sggCd}{x.umdCd}" for x in df.itertuples()}
    rows, _ = transactions.transform(df, valid)
    assert rows and all(len(r["region_code"]) == 10 and r["deal_amount"] > 0 for r in rows)
    cancelled = [r for r in rows if r["cancel_date"]]
    assert all(r["cancel_date"] >= r["deal_date"] for r in cancelled)


def test_malformed_row_fails_only_that_month(monkeypatch, fake_run):
    # 필수 값(거래금액)이 빠진 행 하나가 나머지 시군구 수집을 멈추면 안 된다
    monkeypatch.setattr(transactions, "sigungu_codes", lambda: ["11590", "11680"])
    monkeypatch.setattr(FakeApi, "get_data", lambda self, *a, **k: frame({"dealAmount": ""}) if a[2] == "11590" else frame({}))
    with pytest.raises(RuntimeError) as e:
        transactions.run()
    assert "11590" in str(e.value) and "TypeError" in str(e.value)
    assert len(fake_run["upsert"]) == 1 and fake_run["fresh"] == []


class FlakyApi:
    def __init__(self, errors):
        self.errors, self.calls = list(errors), 0

    def get_data(self, *a, **k):
        self.calls += 1
        if self.errors:
            raise self.errors.pop(0)
        return frame({})


@pytest.mark.parametrize("err", [requests.ConnectionError("x"), requests.Timeout("x")])
def test_fetch_retries_once_on_network_error(err):
    api = FlakyApi([err])
    assert len(transactions.fetch(api, "41480", "202611")) == 1 and api.calls == 2


def test_fetch_gives_up_after_second_network_error():
    api = FlakyApi([requests.ConnectionError("serviceKey=SECRET")] * 2)
    with pytest.raises(RuntimeError, match=r"^41480 202611: ConnectionError$"):
        transactions.fetch(api, "41480", "202611")
    assert api.calls == 2


def test_library_requests_time_out(monkeypatch):
    # 응답 없는 서버: timeout이 없으면 영원히 기다린다(Actions에서 호출 하나가 약 16분 멈춘 원인)
    import socket, threading, time
    from PublicDataReader.PublicDataPortal import molit
    srv = socket.socket()
    srv.bind(("127.0.0.1", 0))
    srv.listen()
    threading.Thread(target=lambda: (srv.accept(), time.sleep(10)), daemon=True).start()
    monkeypatch.setattr(transactions, "FETCH_TIMEOUT_S", 0.5)
    start = time.monotonic()
    with pytest.raises(requests.Timeout):
        molit.requests.get(f"http://127.0.0.1:{srv.getsockname()[1]}/")
    assert time.monotonic() - start < 3


def test_parse_sigungu():
    assert transactions.parse_sigungu(None) is None and transactions.parse_sigungu(" ") is None
    assert transactions.parse_sigungu("41591, 28125") == ["41591", "28125"]
    for bad in ("4159", "41591,abc", "41591;rm"):
        with pytest.raises(ValueError):
            transactions.parse_sigungu(bad)


def test_run_only_given_sigungu(monkeypatch, fake_run):
    monkeypatch.setenv("TRANSACTIONS_SGG", "11680")
    monkeypatch.setattr(transactions, "sigungu_codes", lambda: pytest.fail("전체 목록을 읽으면 안 된다"))
    transactions.run()
    assert len(fake_run["upsert"]) == 1
