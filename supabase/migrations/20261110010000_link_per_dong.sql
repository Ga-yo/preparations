-- 첫 연결은 시군구 하나에 수천~1만여 행을 한 문장으로 갱신해, 대량 갱신이 이어지면 무료 DB에서 statement timeout이 났다
-- (실측: 경기 광주시 6천 행). 인자로 법정동 10자리도 받아 collector가 동 단위로 나눠 부른다.

create or replace function public.link_transactions_to_complexes(sgg text) returns table (linked int, ambiguous int)
language plpgsql security definer set search_path = '' as $$
declare n_linked int; n_amb int; lo char(10); hi char(10);
begin
  if sgg is null or sgg !~ '^([0-9]{5}|[0-9]{10})$' then
    raise exception 'sgg must be 5 or 10 digits' using errcode = '22023';
  end if;
  lo := rpad(sgg, 10, '0'); hi := rpad(sgg, 10, '9');  -- 10자리면 그 법정동 하나
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
