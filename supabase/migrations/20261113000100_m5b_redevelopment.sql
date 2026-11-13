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
