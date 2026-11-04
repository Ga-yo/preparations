-- collector regulated_areas job의 upsert 키 (재실행해도 중복 없음)
alter table public.regulated_areas add constraint regulated_areas_region_type_date_key
  unique (region_code, area_type, effective_date);
