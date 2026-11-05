begin;
select plan(8);

delete from public.transactions;
insert into public.regions (code, sido, sigungu, eupmyeondong, full_name) values
  ('1100000000', '서울특별시', null, null, '서울특별시'),
  ('1168000000', '서울특별시', '강남구', null, '서울특별시 강남구'),
  ('1168010300', '서울특별시', '강남구', '개포동', '서울특별시 강남구 개포동'),
  ('1165000000', '서울특별시', '서초구', null, '서울특별시 서초구'),
  ('1165010100', '서울특별시', '서초구', '방배동', '서울특별시 서초구 방배동'),
  ('4111000000', '경기도', '수원시', null, '경기도 수원시'),
  ('4111100000', '경기도', '수원시 장안구', null, '경기도 수원시 장안구'),
  ('4111112900', '경기도', '수원시 장안구', '파장동', '경기도 수원시 장안구 파장동'),
  ('2611000000', '부산광역시', '중구', null, '부산광역시 중구')
on conflict (code) do nothing;

-- 개포동: 유효 중개 5억(84)·7억(84)·9억(59), 해제 1억, 직거래 2억, 기간 밖 30억 / 방배동: 6억·8억
insert into public.transactions (source_key, property_type, region_code, building_name, exclusive_area, deal_amount, deal_date, deal_type, cancel_date)
select k, 'apartment', rc, '테스트', ar, amt, (now() at time zone 'Asia/Seoul')::date - d, dt, cd
from (values
  ('t1', '1168010300', 84.0, 500000000, 10, '중개거래', null::date),
  ('t2', '1168010300', 84.9, 700000000, 20, '중개거래', null),
  ('t3', '1168010300', 59.9, 900000000, 30, '중개거래', null),
  ('t4', '1168010300', 84.0, 100000000, 15, '중개거래', current_date),
  ('t5', '1168010300', 84.0, 200000000, 15, '직거래', null),
  ('t6', '1168010300', 84.0, 3000000000, 400, '중개거래', null),
  ('t7', '1165010100', 84.0, 600000000, 5, '중개거래', null),
  ('t8', '1165010100', 84.0, 800000000, 6, null, null)
) v (k, rc, ar, amt, d, dt, cd);

select set_eq($$select sigungu_code from public.capital_sigungu where sigungu_code in ('11680','41110','41111','26110')$$,
  array['11680','41111'], '구가 있는 시(41110)와 수도권 밖(26110)은 제외');
select results_eq($$select median_price, deal_count from public.region_price_stats('11680','apartment',12)$$,
  $$values (700000000::bigint, 3)$$, '해제·직거래·기간 밖 제외 중위가');
select is((select median_price from public.region_price_stats('11650','apartment',12)), 700000000::bigint, '짝수 건 중위');
select is((select count(*)::int from public.region_price_stats('11','apartment',12)), 2, '시도 접두사는 시군구별 행');
select is((select deal_count from public.region_price_stats('11680','apartment',12, 80, 90)), 2, '면적 필터');
select is((select sigungu_name from public.region_price_stats('11680','apartment',12)), '서울특별시 강남구', '이름');
select throws_ok($$select * from public.region_price_stats('1168','apartment',12)$$, '22023', null, '접두사는 2 또는 5자리');
select throws_ok($$select * from public.region_price_stats('11680','apartment',0)$$, '22023', null, 'months 1~24');

select * from finish();
rollback;
