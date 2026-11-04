-- M1 시드: 은행권 주택구입 주담대 규제 (2026-11-04 확인).
-- 선택 규칙(apps/web/lib/calc/rules.ts selectRule): null 조건 = 전체, 'regulated' = 규제지역 유형 하나라도 해당,
-- 'homeless'는 생애최초도 포함, 가격은 [price_min, price_max), 조건 컬럼이 많은 행이 우선, 동률이면 최신 effective_date.
-- 1주택·다주택 행은 넣지 않았다(확인 범위 밖) → 엔진은 rule_missing으로 대출 0원 처리.

-- LTV. 무주택 행(조건 3개)보다 생애최초 행이 이기도록 생애최초 행에 price_min = 0(모든 가격)을 두어 조건 수를 1 올린다.
-- 수도권 비규제(인천·경기 일부) 생애최초 70%는 prefix까지 넣어(조건 5개) 지방 생애최초 80%(조건 4개)보다 우선한다.
-- 서울은 전역이 규제지역이라 prefix 11 비규제 행은 두지 않는다.
insert into public.loan_rules (rule_type, area_type, region_prefix, buyer_type, lender_type, price_min, value, unit, effective_date, source, source_url, note) values
  ('ltv', 'non_regulated', null, 'homeless', 'bank', null, 70, 'percent', '2025-10-16',
   '금융위원회 보도자료 「주택시장 안정화 대책」 관련 「긴급 가계부채 점검회의」 개최 (2025.10.15)', 'https://www.fsc.go.kr/no010101/85432',
   '문서에 현행 비규제지역 LTV 70%로 명시. 최초 시행일은 이보다 앞서며 effective_date는 이 문서로 유효가 확인된 날'),
  ('ltv', 'regulated', null, 'homeless', 'bank', null, 40, 'percent', '2025-10-16',
   '금융위원회 보도자료 「주택시장 안정화 대책」 관련 「긴급 가계부채 점검회의」 개최 (2025.10.15)', 'https://www.fsc.go.kr/no010101/85432',
   '무주택자(처분조건부 1주택 포함) 규제지역 주담대 70%→40%, 규제지역 지정 즉시 적용. 2026.6.30 금융위 보도자료(fsc.go.kr/no010101/87222)에서도 동일'),
  ('ltv', 'regulated', null, 'first_time', 'bank', 0, 70, 'percent', '2025-06-28',
   '금융위원회 보도자료 수도권 중심의 「가계부채 관리 강화 방안」 (2025.6.27)', 'https://www.fsc.go.kr/no010101/84824',
   '생애최초 수도권·규제지역 80%→70%, 6개월 내 전입의무. 2026.6.30 보도자료 각주 "생애최초 주택구입 등은 완화된 LTV(60~70%)"'),
  ('ltv', 'non_regulated', '28', 'first_time', 'bank', 0, 70, 'percent', '2025-06-28',
   '금융위원회 보도자료 수도권 중심의 「가계부채 관리 강화 방안」 (2025.6.27)', 'https://www.fsc.go.kr/no010101/84824',
   '생애최초 수도권(인천) 70%'),
  ('ltv', 'non_regulated', '41', 'first_time', 'bank', 0, 70, 'percent', '2025-06-28',
   '금융위원회 보도자료 수도권 중심의 「가계부채 관리 강화 방안」 (2025.6.27)', 'https://www.fsc.go.kr/no010101/84824',
   '생애최초 수도권(경기) 70%'),
  ('ltv', 'non_regulated', null, 'first_time', 'bank', 0, 80, 'percent', '2025-06-28',
   '금융위원회 보도자료 수도권 중심의 「가계부채 관리 강화 방안」 (2025.6.27)', 'https://www.fsc.go.kr/no010101/84824',
   '현행 全지역 80% 중 지방(규제지역 外)은 현행과 동일');

-- DSR: 은행권 차주단위 40%. 조건은 lender_type 하나뿐이라 모든 지역·차주에 적용.
insert into public.loan_rules (rule_type, lender_type, value, unit, effective_date, source, source_url, note) values
  ('dsr', 'bank', 40, 'percent', '2022-07-01',
   '금융위원회 보도자료 「가계부채 관리 강화방안」 (2021.10.26)', 'https://www.fsc.go.kr/no010101/76740',
   '차주단위 DSR 은행 40%. 3단계(2022.7~ 총대출액 1억원 초과 차주) 시행일. 1억원 이하 차주 예외는 모델링하지 않음(보수적)');

-- 주택구입목적 주담대 한도: 수도권(서울 11·인천 28·경기 41) 또는 규제지역, 시가 구간별.
-- "15억 이하"는 price_max 15억+1원(배타 상한). 서울은 prefix 행과 regulated 행이 같은 값이라 어느 쪽이 골라져도 같다.
-- 지방 비규제지역은 행이 없다 = 총액한도 없음(문서상 현행 "총액한도 없음").
insert into public.loan_rules (rule_type, area_type, region_prefix, lender_type, price_min, price_max, value, unit, effective_date, source, source_url, note)
select 'loan_cap', s.area_type, s.region_prefix, 'bank', t.price_min, t.price_max, t.cap, 'won', '2025-10-16',
  '금융위원회 보도자료 「주택시장 안정화 대책」 관련 「긴급 가계부채 점검회의」 개최 (2025.10.15)', 'https://www.fsc.go.kr/no010101/85432',
  '수도권·규제지역 주택구입목적 주담대 한도 시가 15억 이하 6억 / 15억 초과~25억 이하 4억 / 25억 초과 2억 (10.16 시행)'
from (values (null, '11'), (null, '28'), (null, '41'), ('regulated', null)) as s(area_type, region_prefix)
cross join (values
  (null::bigint, 1500000001::bigint, 600000000::bigint),
  (1500000001, 2500000001, 400000000),
  (2500000001, null, 200000000)
) as t(price_min, price_max, cap);

-- 스트레스 DSR 가산금리(변동형 기준, DSR 산정에만 사용).
-- 기본 행(조건 1개) = 지방(수도권·규제지역 外) 0.75%p, 2026.12.31까지. 수도권 prefix·규제지역 행(조건 2개)이 3.0%로 우선한다.
-- 2027년 이후 지방 값은 미확정이라 넣지 않았다(행이 없으면 엔진이 rule_missing으로 대출 0원 처리하므로 연말 전 갱신 필요).
insert into public.loan_rules (rule_type, area_type, region_prefix, lender_type, value, unit, effective_date, end_date, source, source_url, note) values
  ('stress_rate', null, null, 'bank', 0.75, 'percent', '2026-07-01', '2026-12-31',
   '금융위원회공고 제2026-362호 「3단계 스트레스 DSR 제도」 관련 행정지도 변경시행 예고 (2026.6.18)',
   'https://better.fsc.go.kr/fsc_new/status/adminMap/PrvntcDetail.do?muNo=144&postNo=5349&stNo=11',
   '지방 주담대는 산출 스트레스 금리(하한 1.5%)의 50% = 0.75%p, ~2026.12.31. 0.75% 수치는 2025.5.20 3단계 시행방안(fsc.go.kr/no010101/84617)에도 명시. 혼합·주기형은 더 낮음'),
  ('stress_rate', null, '11', 'bank', 3.0, 'percent', '2025-10-16', null,
   '금융위원회 보도자료 「주택시장 안정화 대책」 관련 「긴급 가계부채 점검회의」 개최 (2025.10.15)', 'https://www.fsc.go.kr/no010101/85432',
   '수도권·규제지역 주담대 스트레스 금리 하한 1.5%→3.0% (10.16 시행). 공고 제2026-362호에서도 3.0% 이상 유지'),
  ('stress_rate', null, '28', 'bank', 3.0, 'percent', '2025-10-16', null,
   '금융위원회 보도자료 「주택시장 안정화 대책」 관련 「긴급 가계부채 점검회의」 개최 (2025.10.15)', 'https://www.fsc.go.kr/no010101/85432',
   '수도권(인천)'),
  ('stress_rate', null, '41', 'bank', 3.0, 'percent', '2025-10-16', null,
   '금융위원회 보도자료 「주택시장 안정화 대책」 관련 「긴급 가계부채 점검회의」 개최 (2025.10.15)', 'https://www.fsc.go.kr/no010101/85432',
   '수도권(경기)'),
  ('stress_rate', 'regulated', null, 'bank', 3.0, 'percent', '2025-10-16', null,
   '금융위원회 보도자료 「주택시장 안정화 대책」 관련 「긴급 가계부채 점검회의」 개최 (2025.10.15)', 'https://www.fsc.go.kr/no010101/85432',
   '규제지역(수도권 밖 지정 대비)');
