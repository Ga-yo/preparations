begin;
select plan(3);
-- 3단계 TIP은 폼 입력(또는 카드 표시) 이름에 연결된 7개뿐: spec ex1·ex2 원문이 두 번 들어가면 get_tip이 중복을 돌려준다
select is((select count(*)::int from public.tips where stage = 3), 7, '3단계 TIP 7개');
select is((select count(*)::int from public.tips where stage = 3 and field_key not in
  ('approval_year_min', 'household_count_min', 'floor_area_ratio_max', 'land_share', 'redevelopment_interest', 'station_distance_max_m')), 0,
  '모든 3단계 TIP이 화면 입력 이름에 연결');
select is((select count(*)::int from public.tips where stage = 4), 6, '4단계 TIP 6개');
select * from finish();
rollback;
