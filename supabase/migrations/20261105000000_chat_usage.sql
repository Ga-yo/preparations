-- /api/chat 사용자별 하루 호출 수. chat_messages는 본인이 지울 수 있어 개수 세기로는 한도를 우회할 수 있으므로 별도 카운터를 둔다.
create table public.chat_usage (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  count int not null default 0,
  primary key (user_id, day)
);
alter table public.chat_usage enable row level security;
-- 읽기만 허용. 쓰기는 아래 security definer 함수로만.
create policy "owner read" on public.chat_usage for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.chat_usage from anon, authenticated;

create function public.bump_chat_usage() returns int
language sql security definer set search_path = '' as $$
  insert into public.chat_usage (user_id, day, count)
  values (auth.uid(), (now() at time zone 'Asia/Seoul')::date, 1)
  on conflict (user_id, day) do update set count = public.chat_usage.count + 1
  returning count;
$$;
revoke execute on function public.bump_chat_usage() from public, anon;
grant execute on function public.bump_chat_usage() to authenticated;
