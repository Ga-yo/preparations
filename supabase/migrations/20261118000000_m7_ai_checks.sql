-- M7: 단계별 AI 점검 결과(M7-D1~D9). 입력 해시가 같으면 다시 부르지 않고 이 행을 보여 준다(무료 한도 절약)
create table public.ai_checks (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  stage smallint not null check (stage between 1 and 5),
  input_hash text not null,
  summary text not null,
  questions text[] not null default '{}',
  action jsonb, -- {field: 'priority.<key>', value: 'prefer'|'ignore', label}. 3단계 폼 미리 선택용, 저장은 사용자가
  tools text[] not null default '{}', -- 점검 중 호출한 툴 이름(화면의 "AI가 확인한 것")
  created_at timestamptz not null default now(),
  foreign key (plan_id, user_id) references public.plans (id, user_id) on delete cascade
);
create index ai_checks_plan_stage_idx on public.ai_checks (plan_id, stage, created_at desc);

alter table public.ai_checks enable row level security;
create policy "owner read" on public.ai_checks for select to authenticated using (user_id = (select auth.uid()));
create policy "owner insert" on public.ai_checks for insert to authenticated with check (user_id = (select auth.uid()));
create policy "owner delete" on public.ai_checks for delete to authenticated using (user_id = (select auth.uid()));
-- 점검 결과는 고치지 않고 새로 만든다
revoke update on public.ai_checks from authenticated;
revoke all on public.ai_checks from anon;
