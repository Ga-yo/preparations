-- M4b: 단지 좌표 기반 역·초등학교 거리 조건, 주변 시설 조회, 지오코딩용 수집기 함수
alter table public.condition_sets
  add column station_distance_max_m integer check (station_distance_max_m between 100 and 5000),
  add column elementary_distance_max_m integer check (elementary_distance_max_m between 100 and 5000);

drop function public.complexes_for_conditions(text[], numeric, numeric, int);

create function public.complexes_for_conditions(
  region_codes text[],
  area_min numeric default null,
  area_max numeric default null,
  months int default 12
) returns table (
  complex_id bigint, name text, region_code text, approval_year smallint, household_count int,
  parking_per_household numeric, floor_area_ratio numeric, building_coverage_ratio numeric,
  land_share_m2 numeric, median_price bigint, deal_count int,
  nearest_station_name text, nearest_station_m int, nearest_elementary_m int
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
    p.median, coalesce(p.n, 0),
    st.name, round(st.d)::int, round(el.d)::int
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
  -- 직선거리 KNN(gist 인덱스). 좌표나 시설이 없으면 null
  left join lateral (
    select q.name, extensions.st_distance(q.location, c.location) as d
    from public.pois q where q.category = 'subway_station'
    order by q.location OPERATOR(extensions.<->) c.location limit 1
  ) st on c.location is not null
  left join lateral (
    select extensions.st_distance(q.location, c.location) as d
    from public.pois q where q.category = 'elementary_school'
    order by q.location OPERATOR(extensions.<->) c.location limit 1
  ) el on c.location is not null
  where exists (
    select 1 from unnest(region_codes) r
    where (r like '%00000' and left(c.region_code, 5) = left(r, 5)) or c.region_code = r
  )
  order by c.id
  limit 3001;  -- 3,000 초과 여부를 툴이 알 수 있게 한 행 더
end $$;
revoke execute on function public.complexes_for_conditions(text[], numeric, numeric, int) from public;
grant execute on function public.complexes_for_conditions(text[], numeric, numeric, int) to anon, authenticated;

create function public.complex_nearby_pois(p_complex_id bigint, radius_m int default 1000)
returns table (category text, name text, lines text[], distance_m int)
language plpgsql stable set search_path = '' as $$
begin
  if radius_m is null or radius_m not between 100 and 3000 then
    raise exception 'radius_m must be between 100 and 3000' using errcode = '22023';
  end if;
  return query
  with c as (select x.location from public.complexes x where x.id = p_complex_id and x.location is not null),
  near as (
    -- 환승역은 노선마다 행이 있으므로 이름으로 묶는다
    select q.category, q.name, case when q.category = 'subway_station' then array_agg(distinct q.attrs->>'line') filter (where q.attrs->>'line' is not null) end as lines,
      round(min(extensions.st_distance(q.location, c.location)))::int as d
    from public.pois q, c
    where q.category in ('subway_station', 'elementary_school', 'middle_school', 'high_school')
      and extensions.st_dwithin(q.location, c.location, radius_m)
    group by q.category, q.name
  ), ranked as (
    select n.*, row_number() over (partition by n.category order by n.d, n.name) rn from near n
  )
  select r.category, r.name, r.lines, r.d from ranked r where r.rn <= 5 order by r.category, r.d, r.name;
end $$;
revoke execute on function public.complex_nearby_pois(bigint, int) from public;
grant execute on function public.complex_nearby_pois(bigint, int) to anon, authenticated;

-- 지오코더가 찾지 못한 단지는 30일간 다시 묻지 않는다(미발견 단지가 호출 상한을 계속 차지하는 것을 막음)
alter table public.complexes add column geocode_missed_on date;

create function public.complexes_missing_location(sgg text)
returns table (id bigint, region_code text, jibun_address text, road_address text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.region_code::text, c.jibun_address, c.road_address
  from public.complexes c
  where c.location is null and left(c.region_code, 5) = sgg
    and (c.geocode_missed_on is null or c.geocode_missed_on < (now() at time zone 'Asia/Seoul')::date - 30)
  order by c.id
$$;
revoke execute on function public.complexes_missing_location(text) from public, anon, authenticated;
grant execute on function public.complexes_missing_location(text) to service_role;

create function public.set_complex_locations(ids bigint[], lons float8[], lats float8[])
returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if cardinality(ids) is distinct from cardinality(lons) or cardinality(ids) is distinct from cardinality(lats) then
    raise exception 'ids, lons, lats must have the same length' using errcode = '22023';
  end if;
  update public.complexes c
  set location = extensions.st_setsrid(extensions.st_makepoint(v.lon, v.lat), 4326)::extensions.geography,
      geocode_missed_on = null
  from unnest(ids, lons, lats) as v (id, lon, lat)
  where c.id = v.id;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.set_complex_locations(bigint[], float8[], float8[]) from public, anon, authenticated;
grant execute on function public.set_complex_locations(bigint[], float8[], float8[]) to service_role;

create function public.mark_geocode_missed(ids bigint[])
returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.complexes set geocode_missed_on = (now() at time zone 'Asia/Seoul')::date where id = any(ids);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.mark_geocode_missed(bigint[]) from public, anon, authenticated;
grant execute on function public.mark_geocode_missed(bigint[]) to service_role;
