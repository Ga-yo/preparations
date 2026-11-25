-- 가까운 공원 이름과 단지·출퇴근 경로 좌표
-- 출퇴근 대표 좌표. 역이 있으면 역(환승역은 노선별 좌표의 중심), 아니면 지역 코드(시군구 코드면 시군구) 단지 좌표의 중심. 없으면 null
create function public.commute_point_of(commute_code text, commute_station text)
returns extensions.geography
language plpgsql stable set search_path = '' as $$
declare
  commute_point extensions.geography;
begin
  if commute_code is not null then
    select extensions.st_centroid(extensions.st_collect(w.location::extensions.geometry))::extensions.geography into commute_point
    from public.complexes w
    where w.location is not null
      and ((commute_code like '%00000' and left(w.region_code, 5) = left(commute_code, 5)) or w.region_code = commute_code::char(10));
  end if;
  if commute_station is not null then
    select extensions.st_centroid(extensions.st_collect(q.location::extensions.geometry))::extensions.geography into commute_point
    from public.pois q
    where q.category = 'subway_station' and q.name = commute_station;
  end if;
  return commute_point;
end $$;
revoke execute on function public.commute_point_of(text, text) from public;
grant execute on function public.commute_point_of(text, text) to anon, authenticated;

drop function public.complexes_for_conditions(text[], numeric, numeric, int, text, text);

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
  nearest_park_m int, shop_count_500m int, commute_m int, nearest_park_name text
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
  commute_point := public.commute_point_of(commute_code, commute_station);
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
    round(extensions.st_distance(c.location, commute_point))::int,
    pk.name
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
    select q.name, extensions.st_distance(q.location, c.location) as d
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

-- 단지 -> 출퇴근 지점 좌표. 서버가 경로 API(분 단위)를 부를 때 쓴다. 좌표가 없으면 0행
create function public.route_points(p_complex_id bigint, commute_code text default null, commute_station text default null)
returns table (from_lon float8, from_lat float8, to_lon float8, to_lat float8)
language plpgsql stable set search_path = '' as $$
declare
  commute_point extensions.geography;
begin
  if commute_code is not null and commute_code !~ '^[0-9]{10}$' then
    raise exception 'commute_code must be a ten-digit code' using errcode = '22023';
  end if;
  if char_length(commute_station) > 30 then
    raise exception 'commute_station must be at most 30 characters' using errcode = '22023';
  end if;
  commute_point := public.commute_point_of(commute_code, commute_station);
  return query
  select extensions.st_x(c.location::extensions.geometry), extensions.st_y(c.location::extensions.geometry),
    extensions.st_x(commute_point::extensions.geometry), extensions.st_y(commute_point::extensions.geometry)
  from public.complexes c
  where c.id = p_complex_id and c.location is not null and commute_point is not null;
end $$;
revoke execute on function public.route_points(bigint, text, text) from public;
grant execute on function public.route_points(bigint, text, text) to anon, authenticated;
