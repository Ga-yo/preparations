-- M6b: 구매 검토 리포트 스냅숏(M6-D6). payload는 툴 결과(예산·비교) 스냅숏, narrative는 AI 해설(사용자가 버튼을 누를 때 채움)
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  payload jsonb not null,
  narrative text,
  created_at timestamptz not null default now(),
  foreign key (plan_id, user_id) references public.plans (id, user_id) on delete cascade
);
create index reports_plan_idx on public.reports (plan_id, created_at desc);

alter table public.reports enable row level security;
create policy "owner read" on public.reports for select to authenticated using (user_id = (select auth.uid()));
create policy "owner insert" on public.reports for insert to authenticated with check (user_id = (select auth.uid()));
create policy "owner delete" on public.reports for delete to authenticated using (user_id = (select auth.uid()));
create policy "owner update" on public.reports for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- 스냅숏(payload)은 고치지 않고 새로 만든다. 웹에는 service role 키가 없으므로 AI 해설(narrative) 칸만 사용자 권한으로 채울 수 있게 한다
revoke update on public.reports from authenticated;
grant update (narrative) on public.reports to authenticated;
revoke all on public.reports from anon;
