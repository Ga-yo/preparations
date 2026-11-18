begin;
select plan(6);

delete from public.candidates;
delete from public.transactions;
delete from public.redevelopment_projects;
delete from public.complexes;
insert into public.regions (code, sido, sigungu, eupmyeondong, full_name) values
  ('1168010300', '서울특별시', '강남구', '개포동', '서울특별시 강남구 개포동')
on conflict (code) do nothing;
insert into public.complexes (bldrgst_pk, name, region_code, jibun, road_address, jibun_address, location, data_as_of, source)
values
  ('pkA', 'A', '1168010300', '1', 'r', 'j', extensions.st_setsrid(extensions.st_makepoint(127.0, 37.5), 4326)::extensions.geography, current_date, 't'),
  ('pkB', 'B', '1168010300', '2', 'r', 'j', null, current_date, 't');

select results_eq($$select name, lon::numeric(6,3), lat::numeric(5,3) from public.complex_points('11680') join public.complexes using (id)$$,
  $$values ('A'::text, 127.000::numeric(6,3), 37.500::numeric(5,3))$$, '좌표 있는 단지만');
select is(public.set_shop_counts(array[(select id from public.complexes where name = 'A')], array[17]), 1, '상가 수 1행 갱신');
select is((select shop_count_500m from public.complexes where name = 'A'), 17, '상가 수 저장');
select throws_ok($$select public.set_shop_counts(array[1::bigint], array[1, 2])$$, '22023', null, '길이 불일치');

set local role anon;
select throws_ok($$select public.set_shop_counts(array[1::bigint], array[1])$$, '42501', null, 'anon은 상가 수 갱신 불가');
select throws_ok($$select * from public.complex_points('11680')$$, '42501', null, 'anon은 단지 좌표 목록 불가');
reset role;

select * from finish();
rollback;
