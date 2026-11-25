-- 단계 페이지를 열 때 AI가 고른 TIP: [{slug, note}]. 입력 해시가 같으면 다시 부르지 않는다(무료 한도 절약)
create table public.tip_picks (
  plan_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  stage smallint not null check (stage between 1 and 5),
  input_hash text not null,
  tips jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  primary key (plan_id, stage),
  foreign key (plan_id, user_id) references public.plans (id, user_id) on delete cascade
);

alter table public.tip_picks enable row level security;
create policy "owner read" on public.tip_picks for select to authenticated using (user_id = (select auth.uid()));
create policy "owner insert" on public.tip_picks for insert to authenticated with check (user_id = (select auth.uid()));
create policy "owner update" on public.tip_picks for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner delete" on public.tip_picks for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.tip_picks from anon;
