begin;
select plan(7);

delete from public.candidates;
delete from public.transactions;
delete from public.redevelopment_projects;
delete from public.complexes;
delete from public.pois;
insert into public.regions (code, sido, sigungu, eupmyeondong, full_name) values
  ('1100000000', '서울특별시', null, null, '서울특별시'),
  ('1168000000', '서울특별시', '강남구', null, '서울특별시 강남구'),
  ('1168010300', '서울특별시', '강남구', '개포동', '서울특별시 강남구 개포동'),
  ('1165000000', '서울특별시', '서초구', null, '서울특별시 서초구'),
  ('1165010100', '서울특별시', '서초구', '방배동', '서울특별시 서초구 방배동')
on conflict (code) do nothing;

-- A(개포, 좌표), B(개포, 좌표 없음), W1·W2(방배, 출퇴근 지역 중심 = 127.01, 37.5). 위도 37.5에서 경도 0.001도 약 88m
insert into public.complexes (bldrgst_pk, name, region_code, jibun, road_address, jibun_address, location, shop_count_500m, data_as_of, source)
values
  ('pkA', 'A', '1168010300', '1', 'r', 'j', extensions.st_setsrid(extensions.st_makepoint(127.0, 37.5), 4326)::extensions.geography, 42, current_date, 't'),
  ('pkB', 'B', '1168010300', '2', 'r', 'j', null, null, current_date, 't'),
  ('pkW1', 'W1', '1165010100', '1', 'r', 'j', extensions.st_setsrid(extensions.st_makepoint(127.009, 37.5), 4326)::extensions.geography, null, current_date, 't'),
  ('pkW2', 'W2', '1165010100', '2', 'r', 'j', extensions.st_setsrid(extensions.st_makepoint(127.011, 37.5), 4326)::extensions.geography, null, current_date, 't');

insert into public.pois (category, name, location, attrs, data_as_of, source, source_id)
values ('park', '가공원', extensions.st_setsrid(extensions.st_makepoint(127.0023, 37.5), 4326)::extensions.geography, '{}', current_date, 't', 'p1');

select ok((select nearest_park_m between 150 and 250 from public.complexes_for_conditions(array['1168010300']) where name = 'A'), '공원 거리 약 200m');
select is((select shop_count_500m from public.complexes_for_conditions(array['1168010300']) where name = 'A'), 42, '상가 집계 그대로');
select is((select commute_m from public.complexes_for_conditions(array['1168010300']) where name = 'A'), null::int, '출퇴근 지역이 없으면 null');
select ok((select commute_m between 830 and 930 from public.complexes_for_conditions(array['1168010300'], commute_code => '1165010100') where name = 'A'),
  '출퇴근 지역 단지 중심까지 약 880m');
select ok((select commute_m between 830 and 930 from public.complexes_for_conditions(array['1168010300'], commute_code => '1165000000') where name = 'A'),
  '시군구 코드면 시군구 단지 중심');
select results_eq($$select nearest_park_m, commute_m from public.complexes_for_conditions(array['1168010300'], commute_code => '1165010100') where name = 'B'$$,
  $$values (null::int, null::int)$$, '좌표 없는 단지는 null');
select throws_ok($$select * from public.complexes_for_conditions(array['1168010300'], commute_code => 'x')$$, '22023', null, 'commute_code 형식');

select * from finish();
rollback;
