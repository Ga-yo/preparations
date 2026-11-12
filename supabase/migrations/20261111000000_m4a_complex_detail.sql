-- 4단계 단지 상세: 한 단지의 실거래 사례와 월별 중위가. 집계 규칙은 complexes_for_conditions와 같다(해제·직거래 제외).

create function public.complex_trades(
  p_complex_id bigint,
  area_min numeric default null,
  area_max numeric default null,
  lim int default 20
) returns table (deal_date date, deal_amount bigint, exclusive_area numeric, floor smallint)
language plpgsql stable set search_path = '' as $$
begin
  if lim is null or lim not between 1 and 50 then
    raise exception 'lim must be between 1 and 50' using errcode = '22023';
  end if;
  return query
  select t.deal_date, t.deal_amount, t.exclusive_area, t.floor
  from public.transactions t
  where t.complex_id = p_complex_id
    and t.cancel_date is null
    and t.deal_type is distinct from '직거래'
    and (complex_trades.area_min is null or t.exclusive_area >= complex_trades.area_min)
    and (complex_trades.area_max is null or t.exclusive_area <= complex_trades.area_max)
  order by t.deal_date desc, t.id desc
  limit complex_trades.lim;
end $$;
revoke execute on function public.complex_trades(bigint, numeric, numeric, int) from public;
grant execute on function public.complex_trades(bigint, numeric, numeric, int) to anon, authenticated;

create function public.complex_monthly_prices(
  p_complex_id bigint,
  area_min numeric default null,
  area_max numeric default null,
  months int default 24
) returns table (month text, median_price bigint, deal_count int)
language plpgsql stable set search_path = '' as $$
begin
  if months is null or months not between 1 and 36 then
    raise exception 'months must be between 1 and 36' using errcode = '22023';
  end if;
  return query
  select to_char(t.deal_date, 'YYYY-MM'),
    round(percentile_cont(0.5) within group (order by t.deal_amount))::bigint,
    count(*)::int
  from public.transactions t
  where t.complex_id = p_complex_id
    and t.cancel_date is null
    and t.deal_type is distinct from '직거래'
    and t.deal_date >= ((now() at time zone 'Asia/Seoul')::date - make_interval(months => complex_monthly_prices.months))::date
    and (complex_monthly_prices.area_min is null or t.exclusive_area >= complex_monthly_prices.area_min)
    and (complex_monthly_prices.area_max is null or t.exclusive_area <= complex_monthly_prices.area_max)
  group by 1
  order by 1;
end $$;
revoke execute on function public.complex_monthly_prices(bigint, numeric, numeric, int) from public;
grant execute on function public.complex_monthly_prices(bigint, numeric, numeric, int) to anon, authenticated;
