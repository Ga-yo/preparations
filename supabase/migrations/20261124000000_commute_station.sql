-- 2단계 직장·주요 이동 지역에 지하철역 이름을 받는다. 역 좌표까지 직선거리로 commute_m을 계산한다
alter table public.condition_sets
  add column commute_station text check (char_length(commute_station) <= 30);

-- 역 이름 후보(예: 강남역·강남) 중 있는 역과, 같은 이름 역들 사이 최대 거리(m). 환승역은 노선마다 행이 있어 수십 m, 동명 역(양평)은 수십 km
create function public.subway_station_match(p_names text[])
returns table (name text, spread_m int)
language sql stable set search_path = '' as $$
  select a.name, round(max(extensions.st_distance(a.location, b.location)))::int
  from public.pois a
  join public.pois b on b.category = 'subway_station' and b.name = a.name
  where a.category = 'subway_station' and a.name = any(p_names[1:5])
  group by a.name
$$;
revoke execute on function public.subway_station_match(text[]) from public;
grant execute on function public.subway_station_match(text[]) to anon, authenticated;

drop function public.complexes_for_conditions(text[], numeric, numeric, int, text);

create function public.complexes_for_conditions(
  region_codes text[],
  area_min numeric default null,
  area_max numeric default null,
  months int default 12,
  commute_code text default null,
  commute_station text default null
) returns table (
  complex_id bigint, name text, region_code text, approval_year smallint, household_count int,
  parking_per_household numeric, floor_area_ratio numeric, building_coverage_ratio numeric,
  land_share_m2 numeric, median_price bigint, deal_count int,
  nearest_station_name text, nearest_station_m int, nearest_elementary_m int,
  nearest_park_m int, shop_count_500m int, commute_m int
)
language plpgsql stable set search_path = '' as $$
declare
  commute_point extensions.geography;
begin
  if region_codes is null or cardinality(region_codes) not between 1 and 15
     or exists (select 1 from unnest(region_codes) r where r !~ '^[0-9]{10}$') then
    raise exception 'region_codes must be 1-15 ten-digit codes' using errcode = '22023';
  end if;
  if months is null or months not between 1 and 24 then
    raise exception 'months must be between 1 and 24' using errcode = '22023';
  end if;
  if commute_code is not null and commute_code !~ '^[0-9]{10}$' then
    raise exception 'commute_code must be a ten-digit code' using errcode = '22023';
  end if;
  if char_length(commute_station) > 30 then
    raise exception 'commute_station must be at most 30 characters' using errcode = '22023';
  end if;
  -- 출퇴근 지역 대표 좌표: 그 법정동(시군구 코드면 시군구) 단지 좌표의 중심. 단지가 없으면 null (M6 근사)
  if commute_code is not null then
    select extensions.st_centroid(extensions.st_collect(w.location::extensions.geometry))::extensions.geography into commute_point
    from public.complexes w
    where w.location is not null
      and ((commute_code like '%00000' and left(w.region_code, 5) = left(commute_code, 5)) or w.region_code = commute_code::char(10));
  end if;
  -- 출퇴근 역이면 그 역 좌표(환승역은 노선별 좌표의 중심). 같은 이름이 멀리 떨어진 역은 웹이 저장 전에 막는다
  if commute_station is not null then
    select extensions.st_centroid(extensions.st_collect(q.location::extensions.geometry))::extensions.geography into commute_point
    from public.pois q
    where q.category = 'subway_station' and q.name = commute_station;
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
    st.name, round(st.d)::int, round(el.d)::int,
    round(pk.d)::int, c.shop_count_500m,
    round(extensions.st_distance(c.location, commute_point))::int
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
  left join lateral (
    select extensions.st_distance(q.location, c.location) as d
    from public.pois q where q.category = 'park'
    order by q.location OPERATOR(extensions.<->) c.location limit 1
  ) pk on c.location is not null
  where exists (
    select 1 from unnest(region_codes) r
    where (r like '%00000' and left(c.region_code, 5) = left(r, 5)) or c.region_code = r
  )
  order by c.id
  limit 3001;  -- 3,000 초과 여부를 툴이 알 수 있게 한 행 더
end $$;
revoke execute on function public.complexes_for_conditions(text[], numeric, numeric, int, text, text) from public;
grant execute on function public.complexes_for_conditions(text[], numeric, numeric, int, text, text) to anon, authenticated;
