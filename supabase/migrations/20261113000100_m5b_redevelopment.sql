-- M5b: 서울 정비사업 추진현황(서울 열린데이터광장 OA-22856)을 적재하려고 redevelopment_projects를 보강한다.
-- 테이블은 M1부터 비어 있으므로 기본값 없는 not null 추가가 안전하다.
alter table public.redevelopment_projects
  add column source_key text not null,             -- 원본 CODE(구역 고유번호)
  add column address text,                          -- 원본 위치1(지번주소)
  add column match_method text not null default 'none' check (match_method in ('jibun', 'none')),
  add constraint redevelopment_projects_source_key_key unique (source_key),
  add constraint redevelopment_projects_stage_check
    check (stage in ('정비구역지정', '추진위', '조합설립', '건축심의', '사업시행인가', '관리처분인가', '착공'));
comment on column public.redevelopment_projects.stage is '정비구역지정/추진위/조합설립/건축심의/사업시행인가/관리처분인가/착공 (원본 단계 값 매핑)';
create index redevelopment_projects_complex_idx on public.redevelopment_projects (complex_id) where complex_id is not null;

-- 4단계 TIP의 "정비사업 데이터 없음" 안내를 서울 자료 적재에 맞게 고친다
update public.tips
set caution = '어느 단계에 있든 일정 지연이나 중단 가능성이 있고, 단계별 요건과 명칭은 지역과 법령 개정에 따라 다를 수 있습니다. 이 서비스의 정비사업 정보는 서울시가 분기마다 공개하는 추진현황 기준이라 최신 상황과 다를 수 있고, 서울 외 지역은 제공하지 않으니 해당 지자체 정보를 함께 확인하세요.',
    updated_at = now()
where slug = 'redevelopment-stages-4';
