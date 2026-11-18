-- M6a: collector shops job용. 상가 원본은 저장하지 않고 collector가 단지별 반경 500m 상가 수만 계산해 넣는다 (M6-D2)
create function public.complex_points(sgg text)
returns table (id bigint, lon float8, lat float8)
language sql stable security definer set search_path = '' as $$
  select c.id, extensions.st_x(c.location::extensions.geometry), extensions.st_y(c.location::extensions.geometry)
  from public.complexes c
  where c.location is not null and left(c.region_code, 5) = sgg
  order by c.id
$$;
revoke execute on function public.complex_points(text) from public, anon, authenticated;
grant execute on function public.complex_points(text) to service_role;

create function public.set_shop_counts(ids bigint[], counts int[])
returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if cardinality(ids) is distinct from cardinality(counts) then
    raise exception 'ids and counts must have the same length' using errcode = '22023';
  end if;
  update public.complexes c set shop_count_500m = v.n
  from unnest(ids, counts) as v (id, n)
  where c.id = v.id;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.set_shop_counts(bigint[], int[]) from public, anon, authenticated;
grant execute on function public.set_shop_counts(bigint[], int[]) to service_role;
