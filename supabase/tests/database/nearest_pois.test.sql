begin;
select plan(5);

-- 실제 시설과 멀리 떨어진 좌표(바다)에 테스트 단지·시설을 둔다
insert into public.regions (code, sido, sigungu, eupmyeondong, full_name) values
  ('1168000000', '서울특별시', '강남구', null, '서울특별시 강남구'),
  ('1168099900', '서울특별시', '강남구', '테스트동', '서울특별시 강남구 테스트동')
on conflict (code) do nothing;
insert into public.complexes (id, name, region_code, location, household_count, data_as_of, source) overriding system value values
  (900101, '최근접테스트', '1168099900', 'SRID=4326;POINT(131.0 34.0)', 100, current_date, 't'),
  (900102, '좌표없음', '1168099900', null, 100, current_date, 't');
insert into public.pois (category, name, region_code, location, attrs, data_as_of, source, source_id) values
  ('elementary_school', '가초', '1168099900', 'SRID=4326;POINT(131.002 34.0)', '{}', current_date, 't', 'e1'),
  ('elementary_school', '나초', '1168099900', 'SRID=4326;POINT(131.005 34.0)', '{}', current_date, 't', 'e2'),
  ('elementary_school', '다초', '1168099900', 'SRID=4326;POINT(131.05 34.0)', '{}', current_date, 't', 'e3'),
  ('subway_station', '환승역', '1168099900', 'SRID=4326;POINT(131.003 34.0)', '{"line":"2호선"}', current_date, 't', 's1'),
  ('subway_station', '환승역', '1168099900', 'SRID=4326;POINT(131.0031 34.0)', '{"line":"9호선"}', current_date, 't', 's2');

select is((select name from public.complex_nearest_pois(array[900101]) where category = 'elementary_school' order by distance_m limit 1),
  '가초', '가장 가까운 초등학교');
select is((select within_1km from public.complex_nearest_pois(array[900101]) where category = 'elementary_school' limit 1),
  2, '1km 안 초등학교 수(다초 4.6km 제외)');
select is((select count(*)::int from public.complex_nearest_pois(array[900101]) where category = 'subway_station' and name = '환승역'),
  1, '환승역은 이름으로 한 행');
select is((select lines from public.complex_nearest_pois(array[900101]) where name = '환승역'),
  array['2호선', '9호선'], '환승역 노선 모음');
select is((select count(*)::int from public.complex_nearest_pois(array[900102])), 0, '좌표 없는 단지는 0행');

select * from finish();
rollback;
