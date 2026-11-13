begin;
select plan(6);
-- 3단계 TIP은 폼 입력(또는 카드 표시) 이름에 연결된 7개뿐: spec ex1·ex2 원문이 두 번 들어가면 get_tip이 중복을 돌려준다
select is((select count(*)::int from public.tips where stage = 3), 7, '3단계 TIP 7개');
select is((select count(*)::int from public.tips where stage = 3 and field_key not in
  ('approval_year_min', 'household_count_min', 'floor_area_ratio_max', 'land_share', 'redevelopment_interest', 'station_distance_max_m')), 0,
  '모든 3단계 TIP이 화면 입력 이름에 연결');
select is((select count(*)::int from public.tips where stage = 4), 6, '4단계 TIP 6개');
select is((select count(*)::int from public.tips where stage = 5), 5, '5단계 TIP 5개');
select is((select array_agg(distinct field_key order by field_key) from public.tips where stage = 5),
  array['checklist', 'next_steps', 'redevelopment', 'risks'], '5단계 TIP은 화면 섹션 이름에 연결');
select is((select count(*)::int from public.tips where caution like '%정비사업 진행 데이터가 없%'), 0, '정비사업 데이터 적재 후 "데이터 없음" 문구 제거');
select * from finish();
rollback;
