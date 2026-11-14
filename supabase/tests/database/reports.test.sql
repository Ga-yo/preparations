begin;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000b1', 'b1@test.local'),
  ('00000000-0000-4000-8000-0000000000b2', 'b2@test.local');
insert into public.plans (id, user_id) values
  ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000b1'),
  ('00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-0000000000b2');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
select lives_ok($$insert into public.reports (plan_id, payload) values ('00000000-0000-4000-8000-00000000c001', '{"version":1}')$$, '본인 계획 리포트 저장');
select is((select narrative from public.reports), null, 'AI 해설 자리는 비어 있다');
select throws_ok($$insert into public.reports (plan_id, payload) values ('00000000-0000-4000-8000-00000000c002', '{}')$$, null, null, '남의 계획에는 저장 불가');
select throws_ok($$update public.reports set payload = '{}'$$, '42501', null, '스냅숏은 수정 불가');
select lives_ok($$update public.reports set narrative = '해설'$$, 'AI 해설 칸만 채울 수 있다');

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}';
select is((select count(*)::int from public.reports), 0, '남의 리포트는 보이지 않는다');

reset role;
set local role anon;
select throws_ok($$select * from public.reports$$, '42501', null, 'anon은 접근 불가');

select * from finish();
rollback;
