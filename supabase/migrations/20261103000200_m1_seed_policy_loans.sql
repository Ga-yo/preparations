-- M1 시드: 정책 주담대 (2026-11-04 공식 페이지 확인). 각 행은 기본(일반) 조건이고 우대·완화 조건은 note에 적는다.
-- effective_date = 확인일(이 조건이 그날 유효함을 확인). 금리는 기본금리표 범위(우대·가산 전).
insert into public.loan_products (
  source_key, provider, name, product_type, rate_type, rate_min, rate_max, max_amount, max_term_years,
  income_max, house_price_max, exclusive_area_max, asset_max,
  requires_first_time, requires_homeless, requires_newlywed, requires_newborn,
  effective_date, data_as_of, source, source_url, note
) values
  ('policy:didimdol', '주택도시기금', '내집마련 디딤돌대출', 'policy', null, 2.85, 4.15, 200000000, 30,
   60000000, 500000000, 85, 511000000,
   false, true, false, false,
   '2026-11-04', '2026-11-04', '주택도시기금 기금포털 내집마련디딤돌대출 상품안내 (2026-11-04 확인)',
   'https://nhuf.molit.go.kr/FP/FP05/FP0503/FP05030101.jsp',
   '세대원 전원 무주택 세대주. 소득: 생애최초·2자녀 이상 7천만원, 신혼 8.5천만원. 한도: 생애최초 2.4억, 신혼·2자녀 3.2억(2025.6.27 이전 계약은 2.5/3/4억). 주택가격: 신혼·2자녀 6억. 면적: 수도권 외 도시지역 밖 읍·면 100㎡. 순자산 5.11억(2026년 기준). LTV 70%(생애최초 80%, 수도권·규제지역 70%), DTI 60%. 금리는 고정·변동 선택형이라 rate_type 미지정'),
  ('policy:newborn-didimdol', '주택도시기금', '신생아 특례 디딤돌대출', 'policy', null, 1.8, 4.5, 400000000, 30,
   130000000, 900000000, 85, 511000000,
   false, true, false, true,
   '2026-11-04', '2026-11-04', '주택도시기금 기금포털 신생아 특례 디딤돌대출 상품안내 (2026-11-04 확인)',
   'https://nhuf.molit.go.kr/FP/FP05/FP0503/FP05030801.jsp',
   '대출접수일 기준 2년 내 출산(입양, 2023.1.1 이후 출생) 무주택 세대. 소득 부부합산 1.3억(맞벌이 2억, 각 1.3억 이하). 한도 4억(2025.6.27 이전 계약 5억). 특례금리 5년, 추가 출산 1명당 5년 연장(최장 20년). 순자산 5.11억(2026년 기준)'),
  ('policy:bogeumjari', '한국주택금융공사', '보금자리론', 'policy', 'fixed', 4.90, 5.30, 360000000, 50,
   70000000, 600000000, null, null,
   false, false, false, false,
   '2026-11-01', '2026-11-04', '한국주택금융공사 보금자리론 상품안내·금리안내 (2026.11.1 공시 금리, 2026-11-04 확인)',
   'https://www.hf.go.kr/ko/sub01/sub01_01_01.do',
   '무주택 또는 1주택(본건 제외). 금리 2026.11.1 공시: 아낌e 4.90~5.20, u·t 5.00~5.30(만기 10~50년, 금리안내 https://www.hf.go.kr/ko/interest-rate-guidance.do). 11.9 공시분은 5.00~5.40. 규제지역 0.2%p 가산. 한도 3.6억(다자녀·전세사기피해자 4억, 생애최초 4.2억). 소득: 신혼 8.5천만원, 미성년 자녀 1명 9천만원, 다자녀 1억. 40·50년 만기는 연령 요건. LTV 70%(아파트), DTI 60%, 규제지역 각 10%p 차감');
