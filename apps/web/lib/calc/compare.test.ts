import { describe, expect, it } from "vitest";
import type { ComplexRow } from "./conditions";
import type { Fit } from "./fit";
import { compareComplexes, riskFlags, type CompareInput } from "./compare";

const X = (id: number, o: Partial<ComplexRow> = {}): ComplexRow => ({
  complex_id: id, name: `c${id}`, region_code: "1168010100", approval_year: 2010, household_count: 500,
  parking_per_household: 1, floor_area_ratio: 200, building_coverage_ratio: 20, land_share_m2: 30,
  median_price: 500_000_000, deal_count: 5,
  nearest_station_name: "역", nearest_station_m: 300, nearest_elementary_m: 400, ...o,
});
const F = (score: number): Fit => ({ score, met: [], unmet: [], missing: [], within_budget: null });
const I = (row: ComplexRow, o: Partial<CompareInput> = {}): CompareInput =>
  ({ row, fit: F(80), max_budget: 600_000_000, in_conditions: true, ...o });

describe("compareComplexes", () => {
  it("price gap and budget ratio", () => {
    const r = compareComplexes([
      I(X(1, { median_price: 500_000_000 }), { max_budget: 550_000_000 }),
      I(X(2, { median_price: 600_000_000 }), { max_budget: 550_000_000 }),
    ], 2026);
    expect(r.items.map((i) => i.price_gap_from_min)).toEqual([0, 100_000_000]);
    expect(r.items.map((i) => i.budget_ratio)).toEqual([0.91, 1.09]);
    expect(r.items[0].risks).not.toContain("over_budget");
    expect(r.items[1].risks).toContain("over_budget");
  });

  it("best picks lowest price and newest year", () => {
    const r = compareComplexes([
      I(X(1, { median_price: 4e8, approval_year: 2015 })),
      I(X(2, { median_price: 4e8, approval_year: 2005 })),
      I(X(3, { median_price: 5e8, approval_year: 2015 })),
    ], 2026);
    expect(r.best.median_price).toEqual([1, 2]);
    expect(r.best.approval_year).toEqual([1, 3]);
    expect(r.best.nearest_station_m).toEqual([1, 2, 3]);
  });

  it("null values excluded from best", () => {
    const r = compareComplexes([I(X(1, { household_count: null })), I(X(2, { household_count: 300 })), I(X(3, { household_count: 200 }))], 2026);
    expect(r.best.household_count).toEqual([2]);
    const one = compareComplexes([I(X(1, { household_count: null })), I(X(2, { household_count: 300 }))], 2026);
    expect(one.best.household_count).toBeUndefined(); // 값이 하나뿐이면 비교가 아니다
    const r2 = compareComplexes([I(X(1, { household_count: null })), I(X(2, { household_count: null }))], 2026);
    expect(r2.best.household_count).toBeUndefined();
  });

  it("fit_score best uses fit score", () => {
    const r = compareComplexes([I(X(1), { fit: F(60) }), I(X(2), { fit: F(90) })], 2026);
    expect(r.best.fit_score).toEqual([2]);
  });

  it("outside conditions has null fit", () => {
    const r = compareComplexes([I(X(1), { in_conditions: false, fit: null }), I(X(2))], 2026);
    expect(r.items[0].fit).toBeNull();
    expect(r.items[0].risks).toContain("outside_conditions");
    expect(r.items[1].risks).not.toContain("outside_conditions");
  });

  it("null median gives null gap and ratio", () => {
    const r = compareComplexes([I(X(1, { median_price: null, deal_count: 0 })), I(X(2))], 2026);
    expect(r.items[0].price_gap_from_min).toBeNull();
    expect(r.items[0].budget_ratio).toBeNull();
  });
});

describe("riskFlags", () => {
  it("risk codes", () => {
    expect(riskFlags(I(X(1, { deal_count: 0, median_price: null })), 2026)).toContain("no_recent_trades");
    expect(riskFlags(I(X(1, { deal_count: 2 })), 2026)).toContain("few_trades");
    expect(riskFlags(I(X(1, { deal_count: 3 })), 2026)).not.toContain("few_trades");
    expect(riskFlags(I(X(1, { approval_year: 1996 })), 2026)).toContain("old_building");
    expect(riskFlags(I(X(1, { approval_year: 1997 })), 2026)).not.toContain("old_building");
    expect(riskFlags(I(X(1, { nearest_station_m: null, nearest_elementary_m: null })), 2026)).toContain("no_location");
    expect(riskFlags(I(X(1), { max_budget: null }), 2026)).toContain("budget_unknown");
    expect(riskFlags(I(X(1)), 2026)).toEqual([]);
  });
});
