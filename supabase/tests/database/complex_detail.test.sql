begin;
select plan(9);

delete from public.candidates; -- 앱을 써 본 로컬 DB에서도 FK에 막히지 않게(rollback되므로 남지 않음)
delete from public.transactions;
delete from public.complexes;
insert into public.regions (code, sido, sigungu, eupmyeondong, full_name) values
  ('1100000000', '서울특별시', null, null, '서울특별시'),
  ('1168000000', '서울특별시', '강남구', null, '서울특별시 강남구'),
  ('1168010300', '서울특별시', '강남구', '개포동', '서울특별시 강남구 개포동')
on conflict (code) do nothing;

insert into public.complexes (bldrgst_pk, name, region_code, jibun, household_count, data_as_of, source)
values ('pkA', 'A', '1168010300', '12-3', 1000, current_date, 't');

-- 5건: 정상 2(서로 다른 달), 해제 1, 직거래 1, 면적 범위 밖(59㎡) 1
insert into public.transactions (source_key, property_type, region_code, complex_id, building_name, exclusive_area, floor, deal_amount, deal_date, deal_type, cancel_date)
select k, 'apartment', '1168010300', (select id from public.complexes where name = 'A'), 'x', ar, 5, amt,
  (now() at time zone 'Asia/Seoul')::date - d, dt, cd
from (values
  ('t1', 84.0, 1000000000, 10,  '중개거래', null::date),
  ('t2', 84.0, 1200000000, 50,  '중개거래', null),
  ('t3', 84.0, 1100000000, 20,  '중개거래', current_date),
  ('t4', 84.0,  900000000, 30,  '직거래',   null),
  ('t5', 59.0,  800000000, 15,  '중개거래', null)
) v (k, ar, amt, d, dt, cd);

select is((select count(*)::int from public.complex_trades((select id from public.complexes where name = 'A'))), 3, '해제·직거래 제외 3건');
select is((select array_agg(deal_amount order by deal_date desc) from public.complex_trades((select id from public.complexes where name = 'A'))),
  array[1000000000, 800000000, 1200000000]::bigint[], '최신순');
select is((select count(*)::int from public.complex_trades((select id from public.complexes where name = 'A'), null, 70)), 1, 'area_max 70이면 59㎡ 1건');
select is((select count(*)::int from public.complex_trades((select id from public.complexes where name = 'A'), 80, null)), 2, 'area_min 80이면 84㎡ 2건');
select results_eq($$select month from public.complex_monthly_prices((select id from public.complexes where name = 'A'), 80, 90)$$,
  $$select to_char((now() at time zone 'Asia/Seoul')::date - d, 'YYYY-MM') from (values (50), (10)) v(d) order by 1$$, '84㎡만, 월 오름차순 YYYY-MM');
select throws_ok($$select * from public.complex_trades(1, null, null, 0)$$, '22023', null, 'lim 0');
select throws_ok($$select * from public.complex_monthly_prices(1, null, null, 37)$$, '22023', null, 'months 37');

set local role anon;
select lives_ok($$select * from public.complex_trades(1)$$, 'anon 거래 조회');
select lives_ok($$select * from public.complex_monthly_prices(1)$$, 'anon 월별 조회');
reset role;

select * from finish();
rollback;
