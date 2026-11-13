from jobs import redevelopment as rd

REGIONS = {("강남구", "개포동"): "1168010300", ("강남구", "압구정동"): "1168011000", ("성동구", "성수동1가"): "1120011400",
           ("광진구", "중곡동"): "1121510100", ("양천구", "신정동"): "1147010100", ("강남구", "청담동"): "1168010400",
           ("서초구", "개포동"): "1165010300"}


def raw(**kw):
    return {"code": "1001", "gu": "강남구", "zone_name": "개포주공5단지", "jibun_address": "개포동187", "road_address": "",
            "project_type": "공동주택재건축", "stage": "관리처분", "d_zone": "2010-01-01", "d_zone_last": "", "d_committee": "",
            "d_union": "2015-05-01", "d_review": "", "d_permit": "2020-01-01", "d_permit_last": "", "d_mgmt": "2024-01-02",
            "d_mgmt_last": "2025-03-04", "d_start": "", **kw}


def test_stage_mapping():
    assert [rd.stage_of(s) for s in ["구역지정", "추진위", "조합설립", "건축심의", "사업시행", "관리처분", "착공"]] == \
        ["정비구역지정", "추진위", "조합설립", "건축심의", "사업시행인가", "관리처분인가", "착공"]
    assert rd.stage_of("준공") is None and rd.stage_of("") is None


def test_project_type():
    assert rd.project_type_of("아파트지구재건축") == "reconstruction"
    assert rd.project_type_of("주택정비형 재개발") == "redevelopment"
    assert rd.project_type_of("가로주택") is None


def test_parse_location():
    assert rd.parse_location("강남구", "개포동187") == ("개포동", "187")
    assert rd.parse_location("강남구", "압구정동490") == ("압구정동", "490")  # '압구'를 자치구로 잘못 떼지 않는다
    assert rd.parse_location("성동구", "성수동1가656-421") == ("성수동1가", "656-421")
    assert rd.parse_location("광진구", "중곡4동18-24") == ("중곡동", "18-24")  # 행정동 표기 → 법정동
    assert rd.parse_location("양천구", "양천구신정동1200") == ("신정동", "1200")
    assert rd.parse_location("강남구", "청담동65,삼성동53-2") == ("청담동", "65")
    assert rd.parse_location("강남구", "개포동0187-03") == ("개포동", "187-3")
    assert rd.parse_location("강남구", "개포동산12") is None
    assert rd.parse_location("서대문구", "북가좌동80") == ("북가좌동", "80")  # '북가'에서 끊지 않는다
    assert rd.parse_location("성동구", "행당동248번지") == ("행당동", "248")
    assert rd.parse_location("종로구", "창신동23-606번지일원") == ("창신동", "23-606")
    assert rd.parse_location("종로구", "관수동59일대") == ("관수동", "59")
    assert rd.parse_location("중랑구", "망우본동178-1") == ("망우동", "178-1")  # 본동 표기 → 법정동
    assert rd.parse_location("양천구", "목2동232번지일대") == ("목동", "232")
    assert rd.parse_location("동작구", "본동10-1") == ("본동", "10-1")  # 법정동 본동은 그대로
    assert rd.parse_location("서초구", "반포동591-1외5") == ("반포동", "591-1")
    assert rd.parse_location("강남구", "") is None


def test_stage_date_uses_latest_change():
    assert rd.stage_date(raw(), "관리처분인가") == "2025-03-04"
    assert rd.stage_date(raw(d_mgmt_last=""), "관리처분인가") == "2024-01-02"
    assert rd.stage_date(raw(), "추진위") is None
    assert rd.stage_date(raw(d_union="미정"), "조합설립") is None


def test_jibun_match():
    lots = {("1168010300", "187"): [11]}
    (r,) = rd.project_rows([raw()], REGIONS, lots)
    assert r["complex_id"] == 11 and r["match_method"] == "jibun"
    assert r == r | {"source_key": "1001", "name": "개포주공5단지", "project_type": "reconstruction", "stage": "관리처분인가",
                     "stage_date": "2025-03-04", "region_code": "1168010300", "address": "개포동187"}


def test_same_jibun_other_dong_not_matched():
    lots = {("1165010300", "187"): [99]}  # 서초구 개포동 187 (다른 법정동)
    (r,) = rd.project_rows([raw()], REGIONS, lots)
    assert r["complex_id"] is None and r["match_method"] == "none"


def test_ambiguous_lot_not_matched():
    assert rd.match_complex("1168010300", "187", {("1168010300", "187"): [1, 2]}) is None
    assert rd.match_complex(None, "187", {}) is None


def test_unknown_dong_keeps_row_without_region():
    (r,) = rd.project_rows([raw(jibun_address="없는동1")], REGIONS, {})
    assert r["region_code"] is None and r["complex_id"] is None


def test_skips_unknown_stage_or_type():
    rows = rd.project_rows([raw(stage="준공"), raw(code="2", project_type="가로주택"), raw(code="3")], REGIONS, {})
    assert [r["source_key"] for r in rows] == ["3"]


def test_keys_to_delete():
    assert rd.keys_to_delete(["1", "2", "3"], [{"source_key": "2"}]) == ["1", "3"]
