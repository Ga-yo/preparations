begin;
select plan(7);

delete from public.candidates;
delete from public.transactions;
delete from public.redevelopment_projects;
delete from public.complexes;
delete from public.pois;
insert into public.regions (code, sido, sigungu, eupmyeondong, full_name) values
  ('1168010300', '서울특별시', '강남구', '개포동', '서울특별시 강남구 개포동')
on conflict (code) do nothing;

insert into public.complexes (bldrgst_pk, name, region_code, jibun, road_address, jibun_address, location, data_as_of, source)
values ('pkA', 'A', '1168010300', '1', 'r', 'j', extensions.st_setsrid(extensions.st_makepoint(127.0, 37.5), 4326)::extensions.geography, current_date, 't');

-- 환승역(가: 두 노선, 약 18m 차이)과 같은 이름이 멀리 떨어진 역(나). 위도 37.5에서 경도 0.001도 약 88m
insert into public.pois (category, name, location, attrs, data_as_of, source, source_id) values
  ('subway_station', '가', extensions.st_setsrid(extensions.st_makepoint(127.01, 37.5), 4326)::extensions.geography, '{}', current_date, 't', 's1'),
  ('subway_station', '가', extensions.st_setsrid(extensions.st_makepoint(127.0102, 37.5), 4326)::extensions.geography, '{}', current_date, 't', 's2'),
  ('subway_station', '나', extensions.st_setsrid(extensions.st_makepoint(127.0, 37.5), 4326)::extensions.geography, '{}', current_date, 't', 's3'),
  ('subway_station', '나', extensions.st_setsrid(extensions.st_makepoint(127.5, 37.5), 4326)::extensions.geography, '{}', current_date, 't', 's4'),
  ('park', '가', extensions.st_setsrid(extensions.st_makepoint(128.0, 37.5), 4326)::extensions.geography, '{}', current_date, 't', 'p1');

select ok((select commute_m between 830 and 930 from public.complexes_for_conditions(array['1168010300'], commute_station => '가') where name = 'A'),
  '출퇴근 역(환승역은 노선 좌표 중심)까지 약 890m');
select is((select commute_m from public.complexes_for_conditions(array['1168010300'], commute_station => '없음') where name = 'A'), null::int, '없는 역이면 null');
select throws_ok($$select * from public.complexes_for_conditions(array['1168010300'], commute_station => repeat('가', 31))$$, '22023', null, '역 이름 길이');
select results_eq($$select name, spread_m < 100 from public.subway_station_match(array['가', '가역'])$$, $$values ('가'::text, true)$$, '환승역은 한 역(공원 이름은 무시)');
select ok((select spread_m > 40000 from public.subway_station_match(array['나'])), '같은 이름이 멀리 떨어져 있으면 spread가 크다');
select is((select count(*)::int from public.subway_station_match(array['없음'])), 0, '없는 역');
select col_type_is('public', 'condition_sets', 'commute_station', 'text', '출퇴근 역 컬럼');

select * from finish();
rollback;
