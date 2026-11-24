-- 4단계 시세 탭: 전용면적(정수 내림) 그룹별 월 중위가와 최근 거래. 필터·검증은 complex_monthly_prices/complex_trades와 같다(해제·직거래 제외).

create function public.complex_area_monthly_prices(
  p_complex_id bigint,
  area_min numeric default null,
  area_max numeric default null,
  months int default 12
) returns table (area int, month text, median_price bigint, deal_count int)
language plpgsql stable set search_path = '' as $$
begin
  if months is null or months not between 1 and 36 then
    raise exception 'months must be between 1 and 36' using errcode = '22023';
  end if;
  return query
  select floor(t.exclusive_area)::int, to_char(t.deal_date, 'YYYY-MM'),
    round(percentile_cont(0.5) within group (order by t.deal_amount))::bigint,
    count(*)::int
  from public.transactions t
  where t.complex_id = p_complex_id
    and t.cancel_date is null
    and t.deal_type is distinct from '직거래'
    and t.deal_date >= ((now() at time zone 'Asia/Seoul')::date - make_interval(months => complex_area_monthly_prices.months))::date
    and (complex_area_monthly_prices.area_min is null or t.exclusive_area >= complex_area_monthly_prices.area_min)
    and (complex_area_monthly_prices.area_max is null or t.exclusive_area <= complex_area_monthly_prices.area_max)
  group by 1, 2
  order by 1, 2;
end $$;
revoke execute on function public.complex_area_monthly_prices(bigint, numeric, numeric, int) from public;
grant execute on function public.complex_area_monthly_prices(bigint, numeric, numeric, int) to anon, authenticated;

create function public.complex_area_trades(
  p_complex_id bigint,
  area_min numeric default null,
  area_max numeric default null,
  lim_per_area int default 50
) returns table (area int, deal_date date, deal_amount bigint, exclusive_area numeric, floor smallint, area_total int)
language plpgsql stable set search_path = '' as $$
begin
  if lim_per_area is null or lim_per_area not between 1 and 50 then
    raise exception 'lim_per_area must be between 1 and 50' using errcode = '22023';
  end if;
  return query
  select r.area, r.deal_date, r.deal_amount, r.exclusive_area, r.floor, r.area_total
  from (
    select floor(t.exclusive_area)::int as area, t.deal_date, t.deal_amount, t.exclusive_area, t.floor,
      row_number() over (partition by floor(t.exclusive_area) order by t.deal_date desc, t.id desc) as rn,
      (count(*) over (partition by floor(t.exclusive_area)))::int as area_total
    from public.transactions t
    where t.complex_id = p_complex_id
      and t.cancel_date is null
      and t.deal_type is distinct from '직거래'
      and (complex_area_trades.area_min is null or t.exclusive_area >= complex_area_trades.area_min)
      and (complex_area_trades.area_max is null or t.exclusive_area <= complex_area_trades.area_max)
  ) r
  where r.rn <= complex_area_trades.lim_per_area
  order by r.area, r.deal_date desc;
end $$;
revoke execute on function public.complex_area_trades(bigint, numeric, numeric, int) from public;
grant execute on function public.complex_area_trades(bigint, numeric, numeric, int) to anon, authenticated;
