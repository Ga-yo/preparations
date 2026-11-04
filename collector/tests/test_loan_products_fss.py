import json
from datetime import date
from pathlib import Path

from jobs.loan_products_fss import keys_to_retire, transform

PAYLOAD = json.loads((Path(__file__).parent / "fixtures" / "fss_mortgage_dummy.json").read_text(encoding="utf-8"))
D = date(2026, 11, 4)


def rows(**kw):
    return {r["source_key"]: r for r in transform(PAYLOAD, D, **kw)}


def test_one_row_per_product_and_rate_type():
    r = rows()
    assert {k for k in r if "DUMMY-A1" in k} == {"fss:9990001:DUMMY-A1:fixed", "fss:9990001:DUMMY-A1:variable"}
    assert len(r) == 5  # A1 x2, A2 variable(아파트 외 fixed 제외), B1 x2; B2는 전부 아파트 외


def test_rates_are_min_max_of_options():
    a = rows()["fss:9990001:DUMMY-A1:fixed"]
    assert (a["rate_min"], a["rate_max"]) == (3.91, 5.30)
    assert all(isinstance(x["rate_min"], float) and x["rate_min"] <= x["rate_max"] for x in rows().values())


def test_non_apartment_collateral_excluded():
    r = rows()
    assert not [k for k in r if "DUMMY-B2" in k] and "fss:9990001:DUMMY-A2:fixed" not in r


def test_source_key_stable():
    assert transform(PAYLOAD, D)[0]["source_key"] == transform(PAYLOAD, D)[0]["source_key"]


def test_fields():
    a = rows()["fss:9990001:DUMMY-A1:fixed"]
    assert (a["product_type"], a["rate_type"], a["provider"], a["effective_date"], a["data_as_of"]) == (
        "bank", "fixed", "더미은행A", "2026-09-01", "2026-11-04")
    assert a["source"] == "금융감독원 금융상품통합비교공시"


def test_dummy_flag():
    r = rows(dummy=True)
    assert all(k.startswith("dummy:") for k in r)
    a = r["dummy:9990001:DUMMY-A1:fixed"]
    assert a["source"] == "DUMMY(테스트용 가짜 데이터)" and a["note"] == "테스트용 가짜 데이터 — 실제 상품 아님"


EXISTING = {"fss:a", "fss:b", "dummy:x", "dummy:y", "policy:p"}


def test_retire_real_run():
    assert keys_to_retire(EXISTING, {"fss:a"}, dummy=False) == {"fss:b", "dummy:x", "dummy:y"}


def test_retire_dummy_run():
    assert keys_to_retire(EXISTING, {"dummy:x"}, dummy=True) == {"dummy:y"}
