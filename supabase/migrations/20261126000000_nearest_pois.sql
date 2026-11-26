-- 단지별 역·초·중·고 가장 가까운 곳(동점 확인용 최대 4곳)과 1km 안 개수. 거리 제한 없이 KNN으로 찾는다
-- 환승역·같은 학교의 중복 행은 이름으로 묶는다. 화면(4단계 상세·5단계 비교표)용
create function public.complex_nearest_pois(p_complex_ids bigint[])
returns table (complex_id bigint, category text, name text, lines text[], distance_m int, within_1km int)
language sql stable set search_path = '' as $$
  select c.id, cat.category, n.name, n.lines, n.d,
    (select count(distinct q2.name)::int from public.pois q2
      where q2.category = cat.category and extensions.st_dwithin(q2.location, c.location, 1000))
  from public.complexes c
  cross join (values ('subway_station'), ('elementary_school'), ('middle_school'), ('high_school')) as cat(category)
  cross join lateral (
    select q.name,
      case when cat.category = 'subway_station' then array_agg(distinct q.attrs->>'line') filter (where q.attrs->>'line' is not null) end as lines,
      round(min(extensions.st_distance(q.location, c.location)))::int as d
    from (
      select q0.name, q0.attrs, q0.location from public.pois q0
      where q0.category = cat.category
      order by q0.location OPERATOR(extensions.<->) c.location limit 12
    ) q
    group by q.name
    order by d, q.name
    limit 4
  ) n
  where c.id = any(p_complex_ids[1:20]) and c.location is not null
  order by c.id, cat.category, n.d, n.name
$$;
revoke execute on function public.complex_nearest_pois(bigint[]) from public;
grant execute on function public.complex_nearest_pois(bigint[]) to anon, authenticated;
