-- M3: 건축물대장 단지 키·지번, 실거래 ↔ 단지 연결, 3단계 조건용 단지 조회 RPC

alter table public.complexes
  add column bldrgst_pk text unique,  -- 건축물대장 관리번호(mgmBldrgstPk), collector upsert 키
  add column jibun text;              -- '본번-부번' 정규화, 대지(platGbCd=0)만. 실거래 jibun과 같은 표기
create index complexes_region_jibun_idx on public.complexes (region_code, jibun) where jibun is not null;

-- collector 수집 대상: 시군구별 실거래 지번과 연결 여부. PostgREST 행 상한(1000) 때문에 시군구 단위로 부른다
create function public.transaction_lots(sgg text) returns table (region_code text, jibun text, linked boolean)
language sql stable security definer set search_path = '' as $$
  select t.region_code::text, t.jibun, bool_or(t.complex_id is not null)
  from public.transactions t
  where t.region_code between rpad(sgg, 10, '0') and rpad(sgg, 10, '9') and t.jibun is not null
  group by 1, 2 order by 1, 2
$$;
revoke execute on function public.transaction_lots(text) from public, anon, authenticated;
grant execute on function public.transaction_lots(text) to service_role;

-- 지번이 정확히 한 단지와 맞을 때만 연결한다(같은 지번에 단지가 둘이면 엉뚱한 단지에 붙이지 않음)
create function public.link_transactions_to_complexes() returns table (linked int, ambiguous int)
language plpgsql security definer set search_path = '' as $$
declare n_linked int; n_amb int;
begin
  with cand as (
    select region_code, jibun, min(id) as complex_id, count(*) as n
    from public.complexes where jibun is not null group by region_code, jibun
  ), upd as (
    update public.transactions t set complex_id = c.complex_id
    from cand c
    where t.complex_id is null and c.n = 1 and t.region_code = c.region_code and t.jibun = c.jibun
    returning 1
  )
  select count(*) into n_linked from upd;
  select count(*) into n_amb
  from public.transactions t
  join (select region_code, jibun from public.complexes where jibun is not null
        group by region_code, jibun having count(*) > 1) c
    on t.region_code = c.region_code and t.jibun = c.jibun
  where t.complex_id is null;
  return query select n_linked, n_amb;
end $$;
revoke execute on function public.link_transactions_to_complexes() from public, anon, authenticated;
grant execute on function public.link_transactions_to_complexes() to service_role;

create function public.complexes_for_conditions(
  region_codes text[],
  area_min numeric default null,
  area_max numeric default null,
  months int default 12
) returns table (
  complex_id bigint, name text, region_code text, approval_year smallint, household_count int,
  parking_per_household numeric, floor_area_ratio numeric, building_coverage_ratio numeric,
  land_share_m2 numeric, median_price bigint, deal_count int
)
language plpgsql stable set search_path = '' as $$
begin
  if region_codes is null or cardinality(region_codes) not between 1 and 15
     or exists (select 1 from unnest(region_codes) r where r !~ '^[0-9]{10}$') then
    raise exception 'region_codes must be 1-15 ten-digit codes' using errcode = '22023';
  end if;
  if months is null or months not between 1 and 24 then
    raise exception 'months must be between 1 and 24' using errcode = '22023';
  end if;
  return query
  select c.id, c.name, c.region_code::text,
    -- 오래된 단지는 대장에 사용승인일이 비어 있어 실거래 건축년도로 채운다
    coalesce(extract(year from c.approval_date)::smallint, (select max(t2.build_year) from public.transactions t2 where t2.complex_id = c.id)),
    c.household_count,
    round(c.parking_count::numeric / nullif(c.household_count, 0), 2),
    c.floor_area_ratio, c.building_coverage_ratio,
    round(c.site_area_m2 / nullif(c.household_count, 0), 2),
    p.median, coalesce(p.n, 0)
  from public.complexes c
  left join lateral (
    -- M2 region_price_stats와 같은 규칙: 해제·직거래 제외, 기간·면적 필터
    select round(percentile_cont(0.5) within group (order by t.deal_amount))::bigint as median, count(*)::int as n
    from public.transactions t
    where t.complex_id = c.id
      and t.cancel_date is null
      and t.deal_type is distinct from '직거래'
      and t.deal_date >= ((now() at time zone 'Asia/Seoul')::date - make_interval(months => complexes_for_conditions.months))::date
      and (complexes_for_conditions.area_min is null or t.exclusive_area >= complexes_for_conditions.area_min)
      and (complexes_for_conditions.area_max is null or t.exclusive_area <= complexes_for_conditions.area_max)
  ) p on true
  where exists (
    select 1 from unnest(region_codes) r
    where (r like '%00000' and left(c.region_code, 5) = left(r, 5)) or c.region_code = r
  )
  order by c.id
  limit 3001;  -- 3,000 초과 여부를 툴이 알 수 있게 한 행 더
end $$;
revoke execute on function public.complexes_for_conditions(text[], numeric, numeric, int) from public;
grant execute on function public.complexes_for_conditions(text[], numeric, numeric, int) to anon, authenticated;
