-- region_code는 char(10)인데 text(rpad 결과)와 비교하면 컬럼이 text로 변환돼 (region_code, deal_date) 인덱스를 못 쓴다.
-- 원격에서 transaction_lots가 50만 행 순차 스캔(5.7초)으로 statement timeout에 걸렸다. 비교값을 char(10)으로 맞춘다.
-- 권한(grant/revoke)은 create or replace가 유지한다.

create or replace function public.transaction_lots(sgg text) returns table (region_code text, jibun text, linked boolean)
language sql stable security definer set search_path = '' as $$
  select t.region_code::text, t.jibun, bool_or(t.complex_id is not null)
  from public.transactions t
  where t.region_code between rpad(sgg, 10, '0')::char(10) and rpad(sgg, 10, '9')::char(10) and t.jibun is not null
  group by 1, 2 order by 1, 2
$$;

create or replace function public.link_transactions_to_complexes(sgg text) returns table (linked int, ambiguous int)
language plpgsql security definer set search_path = '' as $$
declare n_linked int; n_amb int; lo char(10); hi char(10);
begin
  if sgg is null or sgg !~ '^[0-9]{5}$' then
    raise exception 'sgg must be 5 digits' using errcode = '22023';
  end if;
  lo := rpad(sgg, 10, '0'); hi := rpad(sgg, 10, '9');
  with cand as (
    select region_code, jibun, min(id) as complex_id, count(*) as n
    from public.complexes where jibun is not null and region_code between lo and hi group by region_code, jibun
  ), upd as (
    update public.transactions t set complex_id = c.complex_id
    from cand c
    where t.complex_id is null and c.n = 1 and t.region_code = c.region_code and t.jibun = c.jibun
      and t.region_code between lo and hi
    returning 1
  )
  select count(*) into n_linked from upd;
  select count(*) into n_amb
  from public.transactions t
  join (select region_code, jibun from public.complexes where jibun is not null and region_code between lo and hi
        group by region_code, jibun having count(*) > 1) c
    on t.region_code = c.region_code and t.jibun = c.jibun
  where t.complex_id is null and t.region_code between lo and hi;
  return query select n_linked, n_amb;
end $$;

create or replace function public.region_price_stats(
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
  where t.region_code between rpad(sigungu_prefix, 10, '0')::char(10) and rpad(sigungu_prefix, 10, '9')::char(10)
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
