from datetime import date
from pathlib import Path

import pandas as pd
import pytest

from jobs import complexes

FIX = Path(__file__).parent / "fixtures"
RECAP = pd.read_csv(FIX / "bldrgst_recap_sample.csv", dtype=str, keep_default_na=False)
TITLE = pd.read_csv(FIX / "bldrgst_title_sample.csv", dtype=str, keep_default_na=False)
D = "1168010300"  # 강남구 개포동
TODAY = date(2026, 11, 9)


def by_pk(rows):
    return {r["bldrgst_pk"]: r for r in rows}


def test_normalize_jibun():
    assert complexes.normalize_jibun("0012", "0003") == "12-3"
    assert complexes.normalize_jibun("1284", "0000") == "1284"
    assert complexes.normalize_jibun("", "0000") is None


def test_split_jibun():
    assert complexes.split_jibun("12-3") == ("0012", "0003")
    assert complexes.split_jibun("1284") == ("1284", "0000")
    assert complexes.split_jibun("산12") is None


def test_keeps_only_housing_on_transaction_lots():
    # 1284는 아파트(개포자이 프레지던스), 1284-1은 초등학교, 1211-2 연립은 실거래 지번이 아님
    rows, skips = complexes.transform(RECAP, TITLE.iloc[0:0], {(D, "1284"), (D, "1284-1"), (D, "12")}, TODAY)
    names = sorted(r["name"] for r in rows)
    assert names == ["개포자이 프레지던스", "대치,대청 아파트"]
    assert skips["not_housing"] >= 1 and skips["no_transaction"] >= 1


def test_recap_mapping_and_zero_to_null():
    rows, _ = complexes.transform(RECAP, TITLE.iloc[0:0], {(D, "1284"), (D, "12")}, TODAY)
    r = by_pk(rows)
    p = r["1000000000000005593932"]
    assert p == {
        "bldrgst_pk": "1000000000000005593932", "name": "개포자이 프레지던스", "housing_type": "apartment",
        "region_code": D, "jibun": "1284", "jibun_address": p["jibun_address"], "road_address": p["road_address"],
        "approval_date": "2023-02-28", "household_count": 3375, "building_count": 38, "parking_count": 6019,
        "site_area_m2": 142628.4, "total_floor_area_m2": p["total_floor_area_m2"], "floor_area_ratio": 249.8498,
        "building_coverage_ratio": 20.29, "data_as_of": "2026-11-09", "source": complexes.SOURCE,
    }
    old = r["10241103"]  # 대치,대청: 대장에 사용승인일·용적률·대지면적·주차가 비어 있거나 0
    assert old["approval_date"] is None and old["floor_area_ratio"] is None
    assert old["site_area_m2"] is None and old["parking_count"] is None and old["building_coverage_ratio"] is None


def test_title_rows_main_building_only_with_parking_sum():
    rows, skips = complexes.transform(RECAP.iloc[0:0], TITLE, {(D, "1165")}, TODAY)
    assert [r["name"] for r in rows] == ["포이현대빌라트"]
    assert rows[0]["parking_count"] == 28 and rows[0]["building_count"] == 1 and rows[0]["household_count"] == 14
    assert skips["annex"] == 1


def test_title_rows_skipped_when_recap_exists():
    # 같은 대지(지번)에 총괄표제부가 있으면 표제부 행은 같은 단지의 동이다
    title = TITLE.copy()
    title.loc[:, "bun"], title.loc[:, "ji"] = "1284", "0000"
    rows, skips = complexes.transform(RECAP, title, {(D, "1284")}, TODAY)
    assert [r["name"] for r in rows] == ["개포자이 프레지던스"]
    assert skips["has_recap"] >= 1


def test_non_plat_lots_ignored():
    recap = RECAP.copy()
    recap.loc[:, "platGbCd"] = "1"  # 산 지번
    rows, _ = complexes.transform(recap, TITLE.iloc[0:0], {(D, "1284")}, TODAY)
    assert rows == []


def test_duplicate_pk_collapsed():
    rows, skips = complexes.transform(pd.concat([RECAP, RECAP]), TITLE.iloc[0:0], {(D, "1284")}, TODAY)
    assert len(rows) == 1 and skips["duplicate"] == 1


@pytest.fixture
def fake_run(monkeypatch):
    calls = {"upsert": [], "fresh": [], "fetch": [], "link": 0}
    monkeypatch.setenv("DATA_GO_KR_SERVICE_KEY", "SECRET")
    monkeypatch.delenv("COMPLEXES_SGG", raising=False)
    lots = {"11680": [{"region_code": D, "jibun": "1284", "linked": False}, {"region_code": D, "jibun": "1165", "linked": False}],
            "11650": [{"region_code": "1165010100", "jibun": "1", "linked": False}]}
    monkeypatch.setattr(complexes, "transaction_lots", lambda sgg: lots.get(sgg, []))

    def fetch(key, ep, **p):
        calls["fetch"].append((ep, p))
        if p["sigunguCd"] == "11650":
            raise RuntimeError("11650 10100: HTTPError")
        return RECAP if ep == complexes.RECAP_EP else TITLE

    monkeypatch.setattr(complexes, "fetch", fetch)
    monkeypatch.setattr(complexes, "link", lambda sgg: calls.__setitem__("link", calls["link"] + 1) or (5, 0))
    monkeypatch.setattr(complexes.db, "upsert_rows", lambda t, rows, on_conflict: calls["upsert"].append((t, rows, on_conflict)) or len(rows))
    monkeypatch.setattr(complexes.db, "mark_freshness", lambda *a, **k: calls["fresh"].append(a))
    return calls


def test_run_fetches_title_only_for_lots_without_recap(monkeypatch, fake_run):
    monkeypatch.setattr(complexes, "sigungu_codes", lambda: ["11680"])
    complexes.run()
    titles = [p for ep, p in fake_run["fetch"] if ep == complexes.TITLE_EP]
    assert titles == [{"sigunguCd": "11680", "bjdongCd": "10300", "platGbCd": "0", "bun": "1165", "ji": "0000"}]
    names = sorted(r["name"] for _, rows, _ in fake_run["upsert"] for r in rows)
    assert names == ["개포자이 프레지던스", "포이현대빌라트"]
    assert fake_run["upsert"][0][0] == "complexes" and fake_run["upsert"][0][2] == "bldrgst_pk"
    assert fake_run["link"] == 1 and fake_run["fresh"][0][0] == "complexes:building_ledger"


def test_already_linked_lots_skip_title(monkeypatch, fake_run):
    monkeypatch.setattr(complexes, "sigungu_codes", lambda: ["11680"])
    monkeypatch.setattr(complexes, "transaction_lots", lambda sgg: [{"region_code": D, "jibun": "1165", "linked": True}])
    complexes.run()
    assert [ep for ep, _ in fake_run["fetch"]] == [complexes.RECAP_EP]


def test_run_continues_and_skips_freshness_on_failure(monkeypatch, fake_run):
    monkeypatch.setattr(complexes, "sigungu_codes", lambda: ["11650", "11680"])
    with pytest.raises(RuntimeError) as e:
        complexes.run()
    assert "11650" in str(e.value) and "SECRET" not in str(e.value)
    assert fake_run["upsert"] and fake_run["fresh"] == []
    assert fake_run["link"] == 2  # 시군구마다 연결(실패한 시군구의 남은 행도)


def test_fetch_error_hides_key(monkeypatch):
    def boom(*a, **k):
        raise complexes.requests.ConnectionError("https://x/?serviceKey=SECRET")
    monkeypatch.setattr(complexes.time, "sleep", lambda s: None)
    monkeypatch.setattr(complexes.requests, "get", boom)
    with pytest.raises(RuntimeError) as e:
        complexes.fetch("SECRET", complexes.RECAP_EP, sigunguCd="11680", bjdongCd="10300")
    assert "SECRET" not in str(e.value) and "ConnectionError" in str(e.value)


def test_fetch_retries_once_on_5xx(monkeypatch):
    ok = '<response><header><resultCode>00</resultCode></header><body><items><item><mgmBldrgstPk>1</mgmBldrgstPk></item></items><totalCount>1</totalCount></body></response>'
    res = iter([(503, ""), (200, ok)])
    monkeypatch.setattr(complexes.time, "sleep", lambda s: None)
    monkeypatch.setattr(complexes.requests, "get", lambda *a, **k: type("R", (), dict(zip(("status_code", "text"), next(res))))())
    assert len(complexes.fetch("K", complexes.TITLE_EP, sigunguCd="11680", bjdongCd="10500")) == 1


def test_multi_main_buildings_without_recap_skipped():
    # 총괄표제부 없이 주건축물이 여럿이면 동마다 단지 행이 생겨 지번이 영구히 모호해진다
    title = pd.concat([TITLE.iloc[[4]], TITLE.iloc[[4]].assign(mgmBldrgstPk="other")])
    rows, skips = complexes.transform(RECAP.iloc[0:0], title, {(D, "1165")}, TODAY)
    assert rows == [] and skips["multi_title"] == 2


def test_run_skips_title_when_recap_fails(monkeypatch, fake_run):
    monkeypatch.setattr(complexes, "sigungu_codes", lambda: ["11680"])
    def fetch(key, ep, **p):
        fake_run["fetch"].append((ep, p))
        if ep == complexes.RECAP_EP:
            raise RuntimeError("11680 10300: HTTP 503")
        return TITLE
    monkeypatch.setattr(complexes, "fetch", fetch)
    with pytest.raises(RuntimeError):
        complexes.run()
    assert [ep for ep, _ in fake_run["fetch"]] == [complexes.RECAP_EP]


def test_link_runs_per_sigungu(monkeypatch, fake_run):
    monkeypatch.setattr(complexes, "sigungu_codes", lambda: ["11680", "41111"])
    seen = []
    monkeypatch.setattr(complexes, "link", lambda sgg: seen.append(sgg) or (1, 0))
    complexes.run()
    assert seen == ["11680", "41111"]


def test_fetch_retries_on_empty_200(monkeypatch):
    # 실측: 서버가 가끔 200 + 빈 본문을 준다(Actions에서 136회 중 7회 ExpatError)
    ok = '<response><header><resultCode>00</resultCode></header><body><items><item><mgmBldrgstPk>1</mgmBldrgstPk></item></items><totalCount>1</totalCount></body></response>'
    res = iter([(200, ""), (200, " "), (200, ok)])
    monkeypatch.setattr(complexes.time, "sleep", lambda s: None)
    monkeypatch.setattr(complexes.requests, "get", lambda *a, **k: type("R", (), dict(zip(("status_code", "text"), next(res))))())
    assert len(complexes.fetch("K", complexes.RECAP_EP, sigunguCd="11680", bjdongCd="10100")) == 1


def test_fetch_gives_up_after_three_empty(monkeypatch):
    monkeypatch.setattr(complexes.time, "sleep", lambda s: None)
    monkeypatch.setattr(complexes.requests, "get", lambda *a, **k: type("R", (), {"status_code": 200, "text": ""})())
    with pytest.raises(RuntimeError) as e:
        complexes.fetch("K", complexes.RECAP_EP, sigunguCd="11680", bjdongCd="10100")
    assert "empty response" in str(e.value)
