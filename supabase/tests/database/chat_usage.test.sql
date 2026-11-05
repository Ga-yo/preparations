begin;
select plan(5);

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000a1', 'a@test.local');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

select is(public.bump_chat_usage(), 1, '첫 호출은 1');
select is(public.bump_chat_usage(), 2, '같은 날 두 번째 호출은 2');
select is((select count from public.chat_usage), 2, '본인 사용량은 읽을 수 있다');
select throws_ok($$update public.chat_usage set count = 0$$, '42501', null, '사용자가 직접 0으로 되돌릴 수 없다');
select throws_ok($$delete from public.chat_usage$$, '42501', null, '사용자가 직접 지울 수 없다');

select * from finish();
rollback;
