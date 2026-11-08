// get_region_prices·check_conditions 테스트가 함께 쓰는 1단계 예산 픽스처
export const rule = (rule_type: string, value: number) => ({
  id: 1, rule_type, area_type: null, region_prefix: null, buyer_type: null, lender_type: null,
  price_min: null, price_max: null, value, unit: "percent",
  effective_date: "2025-07-01", end_date: null, source: `s-${rule_type}`, source_url: null, note: null,
});
export const product = {
  id: 1, provider: "A은행", name: "주담대", product_type: "bank", rate_type: "variable",
  rate_min: 4, rate_max: 5, max_amount: null, max_term_years: null, income_max: null,
  house_price_max: null, exclusive_area_max: null, asset_max: null, requires_first_time: false,
  requires_homeless: false, requires_newlywed: false, requires_newborn: false,
  effective_date: "2025-01-01", end_date: null, data_as_of: "2026-11-01", source: "t", source_url: null, source_key: null, note: null,
};
export const profile = {
  plan_id: "p1", cash_assets: 150_000_000, annual_income: 120_000_000, existing_debt: null,
  existing_debt_annual_payment: 3_000_000, extra_funds: 50_000_000, owned_house_count: 0,
  is_first_time: false, is_newlywed: false, has_newborn: false,
};
