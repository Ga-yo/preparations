begin;
select plan(10);

delete from public.candidates; -- 로컬 DB에서도 FK에 막히지 않게(rollback되므로 남지 않음)
delete from public.transactions;
delete from public.redevelopment_projects;
delete from public.complexes;
insert into public.regions (code, sido, sigungu, eupmyeondong, full_name) values
  ('1100000000', '서울특별시', null, null, '서울특별시'),
  ('1168000000', '서울특별시', '강남구', null, '서울특별시 강남구'),
  ('1168010300', '서울특별시', '강남구', '개포동', '서울특별시 강남구 개포동')
on conflict (code) do nothing;

insert into public.complexes (bldrgst_pk, name, region_code, jibun, household_count, data_as_of, source)
values ('pkA', 'A', '1168010300', '12-3', 1000, current_date, 't');

-- 지난달 1일 기준(m1), 두 달 전(m2). 84.98: m1 2건(10억·12억) + m2 1건 / 59.84·59.10 각 1건 / 해제·직거래 각 1건
insert into public.transactions (source_key, property_type, region_code, complex_id, building_name, exclusive_area, floor, deal_amount, deal_date, deal_type, cancel_date)
select k, 'apartment', '1168010300', (select id from public.complexes where name = 'A'), 'x', ar, 5, amt,
  (date_trunc('month', (now() at time zone 'Asia/Seoul')::date) - make_interval(months => mo))::date + dd, dt, cd
from (values
  ('t1', 84.98, 1000000000, 1, 0, '중개거래', null::date),
  ('t2', 84.98, 1200000000, 1, 1, '중개거래', null),
  ('t3', 84.98,  900000000, 2, 0, '중개거래', null),
  ('t4', 59.84,  700000000, 1, 2, '중개거래', null),
  ('t5', 59.10,  650000000, 2, 3, '중개거래', null),
  ('t6', 84.98, 2000000000, 1, 4, '중개거래', current_date),
  ('t7', 84.98, 3000000000, 1, 5, '직거래',   null)
) v (k, ar, amt, mo, dd, dt, cd);

select is((select median_price from public.complex_area_monthly_prices((select id from public.complexes where name = 'A'))
  where area = 84 and month = to_char(date_trunc('month', (now() at time zone 'Asia/Seoul')::date) - interval '1 month', 'YYYY-MM')),
  1100000000::bigint, '짝수 건수 중위가는 가운데 두 값 평균, 해제·직거래 제외');
select is((select array_agg(distinct area order by area) from public.complex_area_monthly_prices((select id from public.complexes where name = 'A'))),
  array[59, 84], '59.84·59.10은 59 한 그룹');
select is((select sum(deal_count)::int from public.complex_area_monthly_prices((select id from public.complexes where name = 'A'))), 5, '해제·직거래 제외 5건');
select is((select count(*)::int from public.complex_area_trades((select id from public.complexes where name = 'A'))), 5, '거래도 해제·직거래 제외');
select results_eq($$select area, deal_amount, area_total from public.complex_area_trades((select id from public.complexes where name = 'A'), lim_per_area => 1) order by area$$,
  $$values (59, 700000000::bigint, 2), (84, 1200000000::bigint, 3)$$, 'lim_per_area 1이면 면적마다 최신 1행, area_total은 상한 전 건수');
select is((select count(*)::int from public.complex_area_trades((select id from public.complexes where name = 'A'), area_min => 80) where area = 59), 0, 'area_min 80이면 59 그룹 없음');
select is((select count(*)::int from public.complex_area_monthly_prices((select id from public.complexes where name = 'A'), area_min => 80) where area = 59), 0, '월별도 area_min 80이면 59 없음');
select throws_ok($$select * from public.complex_area_trades(1, lim_per_area => 51)$$, '22023', null, 'lim_per_area 51');
select throws_ok($$select * from public.complex_area_monthly_prices(1, months => 37)$$, '22023', null, 'months 37');

set local role anon;
select lives_ok($$select * from public.complex_area_trades(1); select * from public.complex_area_monthly_prices(1)$$, 'anon 조회');
reset role;

select * from finish();
rollback;
