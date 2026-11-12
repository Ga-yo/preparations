begin;
select plan(15);

delete from public.candidates; -- 앱을 써 본 로컬 DB에서도 FK에 막히지 않게(rollback되므로 남지 않음)
delete from public.transactions;
delete from public.complexes;
insert into public.regions (code, sido, sigungu, eupmyeondong, full_name) values
  ('1100000000', '서울특별시', null, null, '서울특별시'),
  ('1168000000', '서울특별시', '강남구', null, '서울특별시 강남구'),
  ('1168010300', '서울특별시', '강남구', '개포동', '서울특별시 강남구 개포동')
on conflict (code) do nothing;

-- A(12-3) 1983·1,000세대, B(45) 2015·300세대, C·D 같은 지번 77
insert into public.complexes (bldrgst_pk, name, region_code, jibun, approval_date, household_count, parking_count,
  site_area_m2, floor_area_ratio, building_coverage_ratio, data_as_of, source)
values
  ('pkA', 'A', '1168010300', '12-3', '1983-05-12', 1000, 800, 50000, 180, 15, current_date, 't'),
  ('pkB', 'B', '1168010300', '45', null, 300, 450, 12000, 250, 20, current_date, 't'),
  ('pkC', 'C', '1168010300', '77', '2000-01-01', 100, null, 5000, 200, 20, current_date, 't'),
  ('pkD', 'D', '1168010300', '77', '2001-01-01', null, null, 4000, 210, 20, current_date, 't');

insert into public.transactions (source_key, property_type, region_code, building_name, jibun, exclusive_area, deal_amount, deal_date, deal_type, build_year)
select k, 'apartment', '1168010300', 'x', j, ar, amt, (now() at time zone 'Asia/Seoul')::date - 10, '중개거래', 2015
from (values
  ('a1', '12-3', 84.0, 1000000000), ('a2', '12-3', 84.0, 1200000000), ('a3', '12-3', 59.0, 800000000),
  ('b1', '45', 84.0, 1500000000), ('b2', '45', 84.0, 1700000000),
  ('c1', '77', 84.0, 900000000),
  ('x1', '999', 84.0, 900000000)
) v (k, j, ar, amt);

select results_eq($$select linked, ambiguous from public.link_transactions_to_complexes('11650')$$, $$values (0, 0)$$, '다른 시군구만 연결하면 이 시군구는 그대로');
select results_eq($$select linked, ambiguous from public.link_transactions_to_complexes('1168010400')$$, $$values (0, 0)$$, '다른 법정동만 연결하면 이 동은 그대로');
select results_eq($$select linked, ambiguous from public.link_transactions_to_complexes('11680')$$,
  $$values (5, 1)$$, '정확히 한 단지와 맞는 지번만 연결, 같은 지번 2단지는 ambiguous');
select is((select count(*)::int from public.transactions where complex_id is null), 2, '모호 1건·불일치 1건은 null');
select results_eq($$select linked from public.link_transactions_to_complexes('11680')$$, $$values (0)$$, '멱등');
select results_eq($$select region_code, jibun, linked from public.transaction_lots('11680') where jibun in ('12-3','77','999')$$,
  $$values ('1168010300'::text, '12-3'::text, true), ('1168010300', '77', false), ('1168010300', '999', false)$$, '시군구 실거래 지번과 연결 여부');
select is((select approval_year::int from public.complexes_for_conditions(array['1168010300']) where name = 'D'), 2001, '대장 승인일 그대로');
select is((select approval_year::int from public.complexes_for_conditions(array['1168010300']) where name = 'B'), 2015, '대장 승인일이 없으면 실거래 건축년도');

select is((select count(*)::int from public.complexes_for_conditions(array['1168000000'])), 4, '시군구 코드는 시군구 전체');
select results_eq($$select median_price, deal_count, land_share_m2, approval_year::int from public.complexes_for_conditions(array['1168010300']) where name = 'A'$$,
  $$values (1000000000::bigint, 3, 50.00::numeric, 1983)$$, 'A 중위가·건수·평균 대지지분·승인연도');
select is((select deal_count from public.complexes_for_conditions(array['1168010300'], 80, 90) where name = 'A'), 2, '면적 필터');
select throws_ok($$select * from public.complexes_for_conditions(array[]::text[])$$, '22023', null, '빈 배열');
select throws_ok($$select * from public.complexes_for_conditions(array_fill('1168000000'::text, array[16]))$$, '22023', null, '16개');

set local role anon;
select throws_ok($$select * from public.link_transactions_to_complexes('11680')$$, '42501', null, 'anon은 연결 함수 실행 불가');
select throws_ok($$select * from public.transaction_lots('11680')$$, '42501', null, 'anon은 수집 대상 조회 불가');
reset role;

select * from finish();
rollback;
