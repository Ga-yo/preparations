begin;
select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000d1', 'd1@test.local'),
  ('00000000-0000-4000-8000-0000000000d2', 'd2@test.local');
insert into public.plans (id, user_id) values
  ('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-0000000000d1'),
  ('00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-0000000000d2');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}';
select lives_ok($$insert into public.ai_checks (plan_id, stage, input_hash, summary) values ('00000000-0000-4000-8000-00000000e001', 1, 'h', '요약')$$, '본인 계획 점검 저장');
select throws_ok($$insert into public.ai_checks (plan_id, stage, input_hash, summary) values ('00000000-0000-4000-8000-00000000e002', 1, 'h', 's')$$, null, null, '남의 계획에는 저장 불가');
select throws_ok($$insert into public.ai_checks (plan_id, stage, input_hash, summary) values ('00000000-0000-4000-8000-00000000e001', 6, 'h', 's')$$, '23514', null, '단계는 1~5');
select throws_ok($$update public.ai_checks set summary = 'x'$$, '42501', null, '점검 결과는 수정 불가');

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000d2","role":"authenticated"}';
select is((select count(*)::int from public.ai_checks), 0, '남의 점검은 보이지 않는다');

reset role;
set local role anon;
select throws_ok($$select * from public.ai_checks$$, '42501', null, 'anon은 접근 불가');

select * from finish();
rollback;
