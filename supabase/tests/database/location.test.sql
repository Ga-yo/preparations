begin;
select plan(20);

delete from public.candidates; -- 앱을 써 본 로컬 DB에서도 FK에 막히지 않게(rollback되므로 남지 않음)
delete from public.transactions;
delete from public.redevelopment_projects; -- 정비사업 적재 후에도 FK에 막히지 않게(rollback)
delete from public.complexes;
delete from public.pois;
insert into public.regions (code, sido, sigungu, eupmyeondong, full_name) values
  ('1100000000', '서울특별시', null, null, '서울특별시'),
  ('1168000000', '서울특별시', '강남구', null, '서울특별시 강남구'),
  ('1168010300', '서울특별시', '강남구', '개포동', '서울특별시 강남구 개포동')
on conflict (code) do nothing;

-- A는 좌표 있음, B는 없음. 위도 37.5에서 경도 0.001도 약 88m
insert into public.complexes (bldrgst_pk, name, region_code, jibun, road_address, jibun_address, location, data_as_of, source)
values
  ('pkA', 'A', '1168010300', '1', 'r', 'j', extensions.st_setsrid(extensions.st_makepoint(127.0, 37.5), 4326)::extensions.geography, current_date, 't'),
  ('pkB', 'B', '1168010300', '2', 'r', 'j', null, current_date, 't');

insert into public.pois (category, name, location, attrs, data_as_of, source, source_id)
select c, n, extensions.st_setsrid(extensions.st_makepoint(lon, 37.5), 4326)::extensions.geography, a, current_date, 't', sid
from (values
  ('subway_station', '가역', 127.0034, '{"line":"2호선"}'::jsonb, 's1'),
  ('subway_station', '가역', 127.0034, '{"line":"신분당선"}', 's2'),
  ('subway_station', '나역', 127.0102, '{"line":"3호선"}', 's3'),
  ('elementary_school', '다초', 127.0045, '{}', 's4'),
  ('middle_school', '라중', 127.0068, '{}', 's5')
) v (c, n, lon, a, sid);

select is((select nearest_station_name from public.complexes_for_conditions(array['1168010300']) where name = 'A'), '가역', '가장 가까운 역');
select ok((select nearest_station_m between 250 and 350 from public.complexes_for_conditions(array['1168010300']) where name = 'A'), '역 거리 약 300m');
select ok((select nearest_elementary_m between 350 and 450 from public.complexes_for_conditions(array['1168010300']) where name = 'A'), '초등학교 거리 약 400m');
select results_eq($$select nearest_station_name, nearest_station_m, nearest_elementary_m from public.complexes_for_conditions(array['1168010300']) where name = 'B'$$,
  $$values (null::text, null::int, null::int)$$, '좌표 없는 단지는 모두 null');

select is((select count(*)::int from public.complex_nearby_pois((select id from public.complexes where name = 'A')) where category = 'subway_station' and name = '가역'), 1, 'nearby 환승역은 1행');
select is((select cardinality(lines) from public.complex_nearby_pois((select id from public.complexes where name = 'A')) where name = '가역'), 2, 'nearby 환승역 노선 합침');
select is((select count(*)::int from public.complex_nearby_pois((select id from public.complexes where name = 'A')) where name = '나역'), 1, '1000m 이내 나역 포함');
select is((select count(*)::int from public.complex_nearby_pois((select id from public.complexes where name = 'A'), 500) where name = '나역'), 0, '반경 500m에는 나역 없음');
select throws_ok($$select * from public.complex_nearby_pois(1, 50)$$, '22023', null, 'radius 50');

select results_eq($$select id from public.complexes_missing_location('11680')$$,
  $$select id from public.complexes where name = 'B'$$, '좌표 없는 단지만');
select is(public.mark_geocode_missed(array[(select id from public.complexes where name = 'B')]), 1, '미발견 표시 1행');
select is((select count(*)::int from public.complexes_missing_location('11680')), 0, '미발견 표시된 단지는 제외');
select is(public.set_complex_locations(array[(select id from public.complexes where name = 'B')], array[127.001::float8], array[37.5::float8]), 1, '좌표 갱신 1행');
select is((select geocode_missed_on from public.complexes where name = 'B'), null, '좌표가 들어가면 미발견 표시 해제');
select ok((select nearest_station_m is not null from public.complexes_for_conditions(array['1168010300']) where name = 'B'), '갱신 후 B 거리 채워짐');
select throws_ok($$select public.set_complex_locations(array[1::bigint], array[127.0::float8, 127.1], array[37.5::float8])$$, '22023', null, '길이 불일치');

set local role anon;
select throws_ok($$select public.set_complex_locations(array[1::bigint], array[127.0::float8], array[37.5::float8])$$, '42501', null, 'anon은 좌표 갱신 불가');
select throws_ok($$select * from public.complexes_missing_location('11680')$$, '42501', null, 'anon은 좌표 없는 단지 조회 불가');
select throws_ok($$select public.mark_geocode_missed(array[1::bigint])$$, '42501', null, 'anon은 미발견 표시 불가');
reset role;

select throws_ok($$insert into public.condition_sets (plan_id, user_id, station_distance_max_m) values (gen_random_uuid(), gen_random_uuid(), 50)$$,
  '23514', null, '역 거리 50m는 check 위반');

select * from finish();
rollback;
