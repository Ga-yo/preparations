-- M1이 넣은 spec ex1·ex2 TIP은 폼에 없는 field_key(approval_date, household_count)라 화면에 안 보이고,
-- M3 TIP(approval-year-and-rebuild, household-count-and-scale)이 같은 원문을 이미 담고 있어 중복이다.
delete from public.tips where slug in ('approval-year-reconstruction', 'household-count-feasibility');
