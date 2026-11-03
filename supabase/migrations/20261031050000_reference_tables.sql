-- 참조 데이터: collector가 service_role로 적재하고, 앱은 읽기만 한다.
-- 금액은 원 단위 bigint, 면적은 ㎡.

-- 법정동코드. 지역명 → 코드 변환은 이 테이블로 한다 (LLM이 코드를 만들지 않음).
create table public.regions (
  code char(10) primary key,
  sido text not null,
  sigungu text,
  eupmyeondong text,
  ri text,
  full_name text not null,
  is_active boolean not null default true
);
create index regions_full_name_idx on public.regions (full_name);
create index regions_sigungu_code_idx on public.regions (left(code, 5));

-- 규제지역 지정 이력
create table public.regulated_areas (
  id bigint generated always as identity primary key,
  region_code char(10) not null references public.regions (code),
  area_type text not null check (area_type in (
    'speculative_overheated', -- 투기과열지구
    'adjustment_target',      -- 조정대상지역
    'speculation_zone',       -- 투기지역
    'land_transaction_permit' -- 토지거래허가구역
  )),
  effective_date date not null,
  end_date date,
  source text not null,
  source_url text,
  note text,
  check (end_date is null or end_date >= effective_date)
);
create index regulated_areas_region_idx on public.regulated_areas (region_code, effective_date);

-- 대출 규제 (LTV, DSR, 한도 상한). null 조건 컬럼은 "제한 없음/전체"를 뜻한다.
create table public.loan_rules (
  id bigint generated always as identity primary key,
  rule_type text not null check (rule_type in ('ltv', 'dsr', 'loan_cap')),
  area_type text check (area_type in ('regulated', 'non_regulated', 'speculative_overheated', 'adjustment_target', 'speculation_zone')),
  region_prefix text check (region_prefix ~ '^[0-9]{2,10}$'), -- 시도(2)·시군구(5) 등 법정동코드 앞자리
  buyer_type text check (buyer_type in ('first_time', 'homeless', 'one_house', 'multi_house')),
  lender_type text check (lender_type in ('bank', 'non_bank', 'policy')),
  price_min bigint,
  price_max bigint,
  value numeric(14, 2) not null,
  unit text not null check (unit in ('percent', 'won')),
  effective_date date not null,
  end_date date,
  source text not null,
  source_url text,
  note text,
  check (end_date is null or end_date >= effective_date),
  check ((rule_type = 'loan_cap') = (unit = 'won'))
);
create index loan_rules_lookup_idx on public.loan_rules (rule_type, effective_date);

-- 시중은행·정책 대출 상품
create table public.loan_products (
  id bigint generated always as identity primary key,
  provider text not null,
  name text not null,
  product_type text not null check (product_type in ('bank', 'policy')),
  rate_type text check (rate_type in ('fixed', 'variable', 'mixed')),
  rate_min numeric(5, 3),
  rate_max numeric(5, 3),
  max_amount bigint,
  max_term_years smallint,
  income_max bigint,
  house_price_max bigint,
  exclusive_area_max numeric(7, 2),
  asset_max bigint,
  requires_first_time boolean not null default false,
  requires_homeless boolean not null default false,
  requires_newlywed boolean not null default false,
  requires_newborn boolean not null default false,
  effective_date date not null,
  end_date date,
  data_as_of date not null,
  source text not null,
  source_url text,
  note text
);

-- 단지 정보 (공동주택 단지·건축물대장)
create table public.complexes (
  id bigint generated always as identity primary key,
  kapt_code text unique,
  name text not null,
  housing_type text not null default 'apartment' check (housing_type in ('apartment', 'officetel', 'row_house')),
  region_code char(10) not null references public.regions (code),
  road_address text,
  jibun_address text,
  location extensions.geography(point, 4326),
  approval_date date, -- 사용승인일
  household_count integer,
  building_count integer,
  max_floor smallint,
  parking_count integer,
  heating_type text,
  builder text,
  site_area_m2 numeric(12, 2),
  total_floor_area_m2 numeric(14, 2),
  floor_area_ratio numeric(6, 2),       -- 용적률 %
  building_coverage_ratio numeric(5, 2), -- 건폐율 %
  mgmt_fee_per_m2 integer,              -- 월 ㎡당 관리비(원)
  data_as_of date not null,
  source text not null
);
create index complexes_region_idx on public.complexes (region_code);
create index complexes_location_idx on public.complexes using gist (location);

-- 실거래가
create table public.transactions (
  id bigint generated always as identity primary key,
  source_key text not null unique, -- collector가 만드는 중복 제거 키 (재수집 upsert용)
  property_type text not null check (property_type in ('apartment', 'officetel', 'row_house')),
  region_code char(10) not null references public.regions (code),
  complex_id bigint references public.complexes (id),
  building_name text not null,
  jibun text,
  exclusive_area numeric(7, 2) not null,
  floor smallint,
  deal_amount bigint not null,
  deal_date date not null,
  build_year smallint,
  deal_type text, -- 중개거래/직거래
  cancel_date date, -- 해제 신고일 (null이면 유효)
  collected_at timestamptz not null default now()
);
create index transactions_region_date_idx on public.transactions (region_code, deal_date desc);
create index transactions_complex_date_idx on public.transactions (complex_id, deal_date desc);

-- 역·학교·편의시설
create table public.pois (
  id bigint generated always as identity primary key,
  category text not null check (category in (
    'subway_station', 'bus_stop', 'elementary_school', 'middle_school', 'high_school',
    'mart', 'hospital', 'park', 'convenience'
  )),
  name text not null,
  region_code char(10) references public.regions (code),
  location extensions.geography(point, 4326) not null,
  attrs jsonb not null default '{}',
  data_as_of date not null,
  source text not null,
  source_id text,
  unique (category, source, source_id)
);
create index pois_location_idx on public.pois using gist (location);
create index pois_category_idx on public.pois (category);

-- 정비사업 (재건축·재개발)
create table public.redevelopment_projects (
  id bigint generated always as identity primary key,
  name text not null,
  project_type text not null check (project_type in ('reconstruction', 'redevelopment')),
  stage text not null, -- 기본계획/정비구역지정/추진위/조합설립/사업시행인가/관리처분인가/착공/준공
  stage_date date,
  region_code char(10) references public.regions (code),
  complex_id bigint references public.complexes (id),
  location extensions.geography(point, 4326),
  area_m2 numeric(12, 2),
  data_as_of date not null,
  source text not null,
  source_url text
);
create index redevelopment_projects_region_idx on public.redevelopment_projects (region_code);

-- 데이터셋별 기준일. 툴 결과에 데이터 기준일로 붙인다.
create table public.data_freshness (
  dataset text primary key, -- 테이블명 또는 'transactions:apartment' 처럼 세분화
  as_of date not null,
  collected_at timestamptz not null default now(),
  source text not null,
  note text
);

-- TIP 콘텐츠
create table public.tips (
  id bigint generated always as identity primary key,
  slug text not null unique,
  stage smallint not null check (stage between 1 and 5),
  field_key text, -- 연결되는 입력 항목 (예: 'approval_date', 'household_count')
  title text not null,
  body text not null,
  caution text, -- 알아두기
  sort_order integer not null default 0,
  source text,
  updated_at timestamptz not null default now()
);
create index tips_stage_idx on public.tips (stage, sort_order);

-- RLS: 누구나 읽기, 쓰기는 service_role(RLS 우회)만
do $$
declare t text;
begin
  foreach t in array array[
    'regions', 'regulated_areas', 'loan_rules', 'loan_products', 'complexes',
    'transactions', 'pois', 'redevelopment_projects', 'data_freshness', 'tips'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "public read" on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;
