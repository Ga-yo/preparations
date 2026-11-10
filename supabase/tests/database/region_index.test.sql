begin;
select plan(4);
-- region_code는 char(10): text와 비교하면 컬럼이 text로 변환돼 인덱스를 못 쓰고 전체를 훑는다(원격 5.7초, statement timeout).
-- 행이 많고 대상이 적으면 인덱스를 쓸 수 있는 쿼리는 순차 스캔을 하지 않는다(함수 안쪽 계획은 EXPLAIN에 안 보여 통계로 센다).
insert into public.regions (code, sido, sigungu, eupmyeondong, full_name) values
  ('1168010300', '서울특별시', '강남구', '개포동', '서울특별시 강남구 개포동'),
  ('1111010100', '서울특별시', '종로구', '청운동', '서울특별시 종로구 청운동')
on conflict (code) do nothing;
insert into public.transactions (source_key, property_type, region_code, building_name, jibun, exclusive_area, deal_amount, deal_date)
select 'ix' || g, 'apartment', case when g % 1000 = 0 then '1168010300' else '1111010100' end, 'x', (g % 300)::text, 84, 500000000,
  (now() at time zone 'Asia/Seoul')::date - (g % 300)
from generate_series(1, 20000) g;
analyze public.transactions;

create function pg_temp.seq_scans() returns bigint language sql as $$
  select coalesce((select seq_scan from pg_stat_xact_user_tables where relid = 'public.transactions'::regclass), 0)
$$;
create temp table s (n bigint);

insert into s select pg_temp.seq_scans();
select count(*) from public.transaction_lots('11680');
select is(pg_temp.seq_scans() - (select n from s), 0::bigint, 'transaction_lots는 region_code 인덱스를 쓴다');

update s set n = pg_temp.seq_scans();
select count(*) from public.region_price_stats('11680', 'apartment', 12);
select is(pg_temp.seq_scans() - (select n from s), 0::bigint, 'region_price_stats는 region_code 인덱스를 쓴다');

update s set n = pg_temp.seq_scans();
select * from public.link_transactions_to_complexes('11680');
select is(pg_temp.seq_scans() - (select n from s), 0::bigint, 'link_transactions_to_complexes는 region_code 인덱스를 쓴다');

update s set n = pg_temp.seq_scans();
select count(*) from public.transactions t where t.region_code::text between '1168000000' and '1168099999';
select ok(pg_temp.seq_scans() - (select n from s) > 0, '기준: text 비교는 순차 스캔(테스트가 차이를 잡는지 확인)');
select * from finish();
rollback;
