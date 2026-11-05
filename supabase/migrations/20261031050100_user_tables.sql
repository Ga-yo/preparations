-- 사용자 데이터. 모든 테이블 RLS, 본인 행만 접근.
-- 이름·연락처 등 식별 정보 컬럼은 두지 않는다.

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- 집 찾기 여정 (조건별 시나리오를 여러 개 둘 수 있음)
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '내 집 마련',
  current_stage smallint not null default 1 check (current_stage between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id) -- 자식 테이블 복합 FK 대상
);
create index plans_user_idx on public.plans (user_id);
create trigger plans_updated_at before update on public.plans
  for each row execute function public.set_updated_at();

-- 1단계: 구매 상황·자금
create table public.financial_profiles (
  plan_id uuid primary key,
  user_id uuid not null default auth.uid(),
  purpose text check (purpose in ('live', 'invest', 'both')),
  timeline text check (timeline in ('6m', '1y', '2_3y', 'undecided')),
  cash_assets bigint check (cash_assets >= 0),
  annual_income bigint check (annual_income >= 0), -- 개인 또는 부부 합산
  income_is_combined boolean not null default false,
  existing_debt bigint check (existing_debt >= 0),
  existing_debt_annual_payment bigint check (existing_debt_annual_payment >= 0), -- DSR 계산용
  extra_funds bigint check (extra_funds >= 0),
  owned_house_count smallint not null default 0 check (owned_house_count >= 0),
  is_first_time boolean, -- 생애 최초 구매
  is_newlywed boolean,
  child_count smallint check (child_count >= 0),
  has_newborn boolean, -- 2년 내 출산 (정책대출 자격)
  updated_at timestamptz not null default now(),
  foreign key (plan_id, user_id) references public.plans (id, user_id) on delete cascade
);
create trigger financial_profiles_updated_at before update on public.financial_profiles
  for each row execute function public.set_updated_at();

-- 2·3단계: 지역·생활·주택 조건. 조건을 바꾸면 새 행을 만들어 이전 결과와 비교한다.
create table public.condition_sets (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  user_id uuid not null default auth.uid(),
  -- 2단계
  region_codes char(10)[] not null default '{}', -- 희망 시군구·동 (regions.code)
  commute_region_code char(10) references public.regions (code),
  commute_minutes_max smallint,
  uses_transit boolean,
  school_importance smallint check (school_importance between 1 and 5),
  infra_importance smallint check (infra_importance between 1 and 5),
  household_size smallint,
  parking_required boolean,
  environment_prefs text[] not null default '{}', -- 'quiet', 'near_commercial' 등
  region_reason text,
  -- 3단계
  housing_types text[] not null default '{}' check (housing_types <@ array['apartment', 'officetel', 'row_house']),
  price_min bigint,
  price_max bigint,
  area_min numeric(7, 2), -- 전용면적 ㎡
  area_max numeric(7, 2),
  rooms_min smallint,
  baths_min smallint,
  floor_pref text check (floor_pref in ('low', 'mid', 'high')),
  direction_pref text,
  approval_year_min smallint,
  household_count_min integer,
  parking_per_household_min numeric(3, 2),
  mgmt_fee_per_m2_max integer,
  floor_area_ratio_max numeric(6, 2),
  redevelopment_interest boolean,
  priorities jsonb not null default '{}', -- {"price_max": "must", "rooms_min": "prefer", ...} 값: must|prefer|ignore
  created_at timestamptz not null default now(),
  foreign key (plan_id, user_id) references public.plans (id, user_id) on delete cascade,
  unique (id, user_id),
  check (price_min is null or price_max is null or price_min <= price_max),
  check (area_min is null or area_max is null or area_min <= area_max),
  check (jsonb_typeof(priorities) = 'object')
);
create index condition_sets_plan_idx on public.condition_sets (plan_id, created_at desc);

-- 4·5단계: 후보 단지
create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  condition_set_id uuid not null,
  user_id uuid not null default auth.uid(),
  complex_id bigint not null references public.complexes (id),
  fit_score numeric(5, 2),
  pros jsonb not null default '[]',
  cons jsonb not null default '[]',
  is_favorite boolean not null default false, -- 관심 단지
  created_at timestamptz not null default now(),
  foreign key (condition_set_id, user_id) references public.condition_sets (id, user_id) on delete cascade,
  unique (condition_set_id, complex_id)
);
create index candidates_user_favorite_idx on public.candidates (user_id) where is_favorite;

-- 에이전트 대화
create table public.chat_messages (
  id bigint generated always as identity primary key,
  plan_id uuid not null,
  user_id uuid not null default auth.uid(),
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text,
  tool_name text,
  tool_payload jsonb,
  created_at timestamptz not null default now(),
  foreign key (plan_id, user_id) references public.plans (id, user_id) on delete cascade
);
create index chat_messages_plan_idx on public.chat_messages (plan_id, id);

do $$
declare t text;
begin
  foreach t in array array['plans', 'financial_profiles', 'condition_sets', 'candidates', 'chat_messages'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "owner all" on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t
    );
  end loop;
end $$;
