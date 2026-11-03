-- M1: 스트레스 금리 규제 행 허용, 대출상품 upsert 키 추가
alter table public.loan_rules drop constraint loan_rules_rule_type_check;
alter table public.loan_rules add constraint loan_rules_rule_type_check
  check (rule_type in ('ltv', 'dsr', 'loan_cap', 'stress_rate'));

alter table public.loan_products add column source_key text unique;
