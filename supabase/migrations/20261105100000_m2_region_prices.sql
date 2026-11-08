-- M2: 수도권 시군구 목록, 시군구별 실거래 중위가

-- complex_id는 M4 전까지 전부 null: null 행을 인덱스에 담지 않아 용량을 아낀다
drop index public.transactions_complex_date_idx;
create index transactions_complex_date_idx on public.transactions (complex_id, deal_date desc) where complex_id is not null;

-- 실거래가 수집 대상 시군구. 구가 있는 시(수원시 41110 등)는 API가 구 코드로만 응답하므로 뺀다.
create view public.capital_sigungu with (security_invoker = true) as
select left(r.code, 5) as sigungu_code, r.sido, r.full_name
from public.regions r
where r.is_active
  and right(r.code, 5) = '00000'
  and r.sigungu is not null
  and r.sido in ('서울특별시', '인천광역시', '경기도')
  and not (
    substr(r.code, 5, 1) = '0'
    and exists (
      select 1 from public.regions c
      where c.is_active and right(c.code, 5) = '00000'
        and left(c.code, 4) = left(r.code, 4) and substr(c.code, 5, 1) <> '0'
    )
  );
grant select on public.capital_sigungu to anon, authenticated;

-- 시군구별 중위가·건수·최근 거래일. 해제 신고 건과 직거래는 제외(M2-D1).
create function public.region_price_stats(
  sigungu_prefix text,
  housing_type text,
  months int,
  area_min numeric default null,
  area_max numeric default null
) returns table (sigungu_code text, sigungu_name text, median_price bigint, deal_count int, latest_deal_date date)
language plpgsql stable set search_path = '' as $$
begin
  if sigungu_prefix is null or sigungu_prefix !~ '^([0-9]{2}|[0-9]{5})$' then
    raise exception 'sigungu_prefix must be 2 or 5 digits' using errcode = '22023';
  end if;
  if months is null or months not between 1 and 24 then
    raise exception 'months must be between 1 and 24' using errcode = '22023';
  end if;
  return query
  select s.code, (select r.full_name from public.regions r where r.code = s.code || '00000'), s.median, s.n, s.latest
  from (
  select left(t.region_code, 5)::text as code,
    round(percentile_cont(0.5) within group (order by t.deal_amount))::bigint as median,
    count(*)::int as n,
    max(t.deal_date) as latest
  from public.transactions t
  -- 범위 조건으로 (region_code, deal_date) 인덱스를 탄다
  where t.region_code between rpad(sigungu_prefix, 10, '0') and rpad(sigungu_prefix, 10, '9')
    and t.property_type = region_price_stats.housing_type
    and t.cancel_date is null
    and t.deal_type is distinct from '직거래'
    and t.deal_date >= ((now() at time zone 'Asia/Seoul')::date - make_interval(months => region_price_stats.months))::date
    and (region_price_stats.area_min is null or t.exclusive_area >= region_price_stats.area_min)
    and (region_price_stats.area_max is null or t.exclusive_area <= region_price_stats.area_max)
  group by left(t.region_code, 5)
  ) s
  order by s.code;
end $$;
revoke execute on function public.region_price_stats(text, text, int, numeric, numeric) from public;
grant execute on function public.region_price_stats(text, text, int, numeric, numeric) to anon, authenticated;
