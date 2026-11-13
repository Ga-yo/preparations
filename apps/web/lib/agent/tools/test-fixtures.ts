import { fakeDb } from "../fake-db";
import type { ToolContext } from "../tool";

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

// check_conditions·condition-context 테스트 공용 조건 세트/단지/ctx 픽스처
export const saved = (o: Record<string, unknown> = {}) => ({
  plan_id: "p1", region_codes: ["1168000000"], area_min: 80, area_max: 90,
  housing_types: ["apartment"], price_min: null, price_max: 900_000_000, approval_year_min: null,
  household_count_min: 1000, parking_per_household_min: null, floor_area_ratio_max: null,
  mgmt_fee_per_m2_max: null, station_distance_max_m: null, elementary_distance_max_m: null, rooms_min: null, baths_min: null, floor_pref: null, direction_pref: null,
  priorities: { household_count_min: "must" }, ...o,
});
export const complex = (complex_id: number, household_count = 1500) => ({
  complex_id, name: `단지${complex_id}`, region_code: "1168010300", approval_year: 2000, household_count,
  parking_per_household: 1, floor_area_ratio: 200, building_coverage_ratio: 20, land_share_m2: 40,
  median_price: 800_000_000, deal_count: 3,
  nearest_station_name: null, nearest_station_m: null, nearest_elementary_m: null,
});

export function mk(o: { rows?: unknown[]; sets?: unknown[]; ledgerAsOf?: string | null; complexes?: unknown[]; redevelopment?: unknown[]; rowsFor?: (args: Record<string, unknown>) => unknown[] | undefined } = {}) {
  const calls: Record<string, unknown>[] = [];
  const ctx: ToolContext = {
    planId: "p1", today: "2026-11-08",
    supabase: fakeDb(
      {
        financial_profiles: [profile],
        loan_rules: [rule("ltv", 70), rule("dsr", 40), rule("stress_rate", 1.5)],
        regulated_areas: [], loan_products: [product],
        regions: [{ code: "1168000000", full_name: "서울특별시 강남구", is_active: true }],
        condition_sets: (o.sets ?? [saved()]) as Record<string, unknown>[],
        complexes: (o.complexes ?? []) as Record<string, unknown>[],
        redevelopment_projects: (o.redevelopment ?? []) as Record<string, unknown>[],
        data_freshness: [
          { dataset: "transactions:apartment", as_of: "2026-11-07", source: "MOLIT" },
          ...(o.ledgerAsOf === null ? [] : [{ dataset: "complexes:building_ledger", as_of: o.ledgerAsOf ?? "2026-11-02", source: "MOLIT" }]),
        ],
      },
      {
        region_price_stats: () => [{ sigungu_code: "11680", sigungu_name: "서울특별시 강남구", median_price: 700_000_000, deal_count: 10, latest_deal_date: "2026-11-01" }],
        complexes_for_conditions: (args) => {
          calls.push(args);
          return (o.rowsFor?.(args) ?? o.rows ?? [complex(1), complex(2, 300)]) as Record<string, unknown>[];
        },
      },
    ),
  };
  return { ctx, calls };
}
