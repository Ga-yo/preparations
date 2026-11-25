begin;
select plan(7);

insert into public.regions (code, sido, sigungu, eupmyeondong, full_name) values
  ('1168000000', '서울특별시', '강남구', null, '서울특별시 강남구'),
  ('1168099900', '서울특별시', '강남구', '테스트동', '서울특별시 강남구 테스트동')
on conflict (code) do nothing;

insert into public.complexes (id, name, region_code, location, household_count, data_as_of, source) overriding system value values
  (900001, '경로테스트A', '1168099900', 'SRID=4326;POINT(127.05 37.48)', 100, current_date, 't'),
  (900002, '경로테스트B', '1168099900', null, 100, current_date, 't');
insert into public.pois (category, name, region_code, location, data_as_of, source, source_id) values
  ('park', '테스트공원', '1168099900', 'SRID=4326;POINT(127.0501 37.4801)', current_date, 't', 'p1'),
  ('subway_station', '테스트역', '1168099900', 'SRID=4326;POINT(127.1 37.5)', current_date, 't', 's1');

select is((select nearest_park_name from public.complexes_for_conditions(array['1168099900']) where complex_id = 900001),
  '테스트공원', '가까운 공원 이름');
select results_eq($$select round(from_lon::numeric, 5), round(from_lat::numeric, 5), round(to_lon::numeric, 5), round(to_lat::numeric, 5)
  from public.route_points(900001, null, '테스트역')$$,
  $$values (127.05000::numeric, 37.48000::numeric, 127.10000::numeric, 37.50000::numeric)$$, '역 이름: 단지 -> 역 좌표');
select results_eq($$select round(to_lon::numeric, 5), round(to_lat::numeric, 5) from public.route_points(900001, '1168099900')$$,
  $$values (127.05000::numeric, 37.48000::numeric)$$, '지역 코드: 그 지역 단지 중심');
select is((select count(*)::int from public.route_points(900002, null, '테스트역')), 0, '단지 좌표 없으면 0행');
select is((select count(*)::int from public.route_points(900001)), 0, '출퇴근 정보 없으면 0행');
select throws_ok($$select * from public.route_points(900001, 'abc')$$, '22023', null, 'commute_code 형식');
select throws_ok($$select * from public.route_points(900001, null, repeat('a', 31))$$, '22023', null, 'commute_station 길이');

select * from finish();
rollback;
