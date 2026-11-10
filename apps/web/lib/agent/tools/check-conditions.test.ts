import { expect, test } from "vitest";
import { fakeDb } from "../fake-db";
import type { ToolContext } from "../tool";
import { checkConditions } from "./check-conditions";
import { product, profile, rule } from "./test-fixtures";

const saved = (o: Record<string, unknown> = {}) => ({
  plan_id: "p1", region_codes: ["1168000000"], area_min: 80, area_max: 90,
  housing_types: ["apartment"], price_min: null, price_max: 900_000_000, approval_year_min: null,
  household_count_min: 1000, parking_per_household_min: null, floor_area_ratio_max: null,
  mgmt_fee_per_m2_max: null, rooms_min: null, baths_min: null, floor_pref: null, direction_pref: null,
  priorities: { household_count_min: "must" }, ...o,
});
const complex = (complex_id: number, household_count = 1500) => ({
  complex_id, name: `단지${complex_id}`, region_code: "1168010300", approval_year: 2000, household_count,
  parking_per_household: 1, floor_area_ratio: 200, building_coverage_ratio: 20, land_share_m2: 40,
  median_price: 800_000_000, deal_count: 3,
});

function mk(o: { rows?: unknown[]; sets?: unknown[]; ledgerAsOf?: string | null } = {}) {
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
        data_freshness: [
          { dataset: "transactions:apartment", as_of: "2026-11-07", source: "MOLIT" },
          ...(o.ledgerAsOf === null ? [] : [{ dataset: "complexes:building_ledger", as_of: o.ledgerAsOf ?? "2026-11-02", source: "MOLIT" }]),
        ],
      },
      {
        region_price_stats: () => [{ sigungu_code: "11680", sigungu_name: "서울특별시 강남구", median_price: 700_000_000, deal_count: 10, latest_deal_date: "2026-11-01" }],
        complexes_for_conditions: (args) => {
          calls.push(args);
          return (o.rows ?? [complex(1), complex(2, 300)]) as Record<string, unknown>[];
        },
      },
    ),
  };
  return { ctx, calls };
}
type Data = { conflicts: { code: string }[]; notices: string[]; counts: { total: number; must: number }; matches: { complex_id: number }[] };

test("저장된 지역·면적으로 RPC 호출, must 필터 결과와 as_of", async () => {
  const { ctx, calls } = mk();
  const r = await checkConditions.run({}, ctx);
  expect(calls).toEqual([{ region_codes: ["1168000000"], area_min: 80, area_max: 90, months: 12 }]);
  const d = r.data as Data;
  expect(d.counts).toMatchObject({ total: 2, must: 1 });
  expect(d.matches.map((m) => m.complex_id)).toEqual([1]);
  expect(r.as_of).toMatchObject({ "complexes:building_ledger": "2026-11-02", "transactions:apartment": "2026-11-07" });
});

test("지역별 예산은 get_region_prices 결과에서 온다(예산 초과 충돌)", async () => {
  const { ctx } = mk({ sets: [saved({ price_max: 9_000_000_000 })] });
  const d = (await checkConditions.run({}, ctx)).data as Data;
  expect(d.conflicts.map((c) => c.code)).toContain("price_max_over_budget");
});

test("3,001행이면 truncated, 3,000행만 분석", async () => {
  const rows = Array.from({ length: 3001 }, (_, i) => complex(i + 1));
  const { ctx } = mk({ rows });
  const d = (await checkConditions.run({}, ctx)).data as Data;
  expect(d.notices).toContain("truncated");
  expect(d.counts.total).toBe(3000);
});

test("단지 대장 freshness가 없으면 as_of에서 키를 뺀다", async () => {
  const { ctx } = mk({ ledgerAsOf: null });
  const r = await checkConditions.run({}, ctx);
  expect(Object.keys(r.as_of)).not.toContain("complexes:building_ledger");
});

test("지역 미저장 → region_required", async () => {
  const { ctx, calls } = mk({ sets: [saved({ region_codes: [] })] });
  expect((await checkConditions.run({}, ctx)).data).toEqual({ error: "region_required" });
  expect(calls).toEqual([]);
});

test("3단계 미저장 → conditions_required", async () => {
  const { ctx } = mk({ sets: [saved({ price_max: null, household_count_min: null, housing_types: [] })] });
  expect((await checkConditions.run({}, ctx)).data).toEqual({ error: "conditions_required" });
});
