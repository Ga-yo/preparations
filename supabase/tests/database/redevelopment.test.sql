begin;
select plan(5);
insert into public.redevelopment_projects (source_key, name, project_type, stage, address, data_as_of, source)
values ('t1', '테스트구역', 'reconstruction', '조합설립', '개포동187', '2026-06-30', 'test');
select throws_ok($$insert into public.redevelopment_projects (source_key, name, project_type, stage, data_as_of, source)
  values ('t2', 'x', 'reconstruction', '기본계획', '2026-06-30', 'test')$$, '23514', null, '정해진 7개 단계 밖은 거부');
select throws_ok($$insert into public.redevelopment_projects (source_key, name, project_type, stage, data_as_of, source)
  values ('t1', 'x', 'reconstruction', '착공', '2026-06-30', 'test')$$, '23505', null, 'source_key 중복 거부');
select throws_ok($$insert into public.redevelopment_projects (source_key, name, project_type, stage, match_method, data_as_of, source)
  values ('t3', 'x', 'reconstruction', '착공', 'name', '2026-06-30', 'test')$$, '23514', null, 'match_method는 jibun/none');
select is((select match_method from public.redevelopment_projects where source_key = 't1'), 'none', 'match_method 기본값 none');
set local role anon;
select is((select count(*)::int from public.redevelopment_projects where source_key = 't1'), 1, 'anon 읽기 가능');
select * from finish();
rollback;
