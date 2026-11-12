import { describe, expect, it } from "vitest";
import type { ComplexRow, Conditions, RegionBudget } from "./conditions";
import { fitScore, neighborStats, rankComplexes } from "./fit";

const C: Conditions = {
  housing_types: [], price_min: null, price_max: null, area_min: null, area_max: null,
  approval_year_min: null, household_count_min: null, parking_per_household_min: null,
  floor_area_ratio_max: null, mgmt_fee_per_m2_max: null, station_distance_max_m: null, elementary_distance_max_m: null, rooms_min: null, baths_min: null,
  floor_pref: null, direction_pref: null, priorities: {},
};
const X = (id: number, o: Partial<ComplexRow> = {}): ComplexRow => ({
  complex_id: id, name: `c${id}`, region_code: "1168010100", approval_year: 2000, household_count: 500,
  parking_per_household: 1, floor_area_ratio: 200, building_coverage_ratio: 20, land_share_m2: 30,
  median_price: 500_000_000, deal_count: 3,
  nearest_station_name: null, nearest_station_m: null, nearest_elementary_m: null, ...o,
});
const B = (max: number | null): RegionBudget[] => [{ sigungu_code: "11680", max_budget: max, median_price: 0 }];

describe("fitScore", () => {
  it("score counts met over active", () => {
    const c = { ...C, price_max: 600_000_000, approval_year_min: 1990, household_count_min: 300, parking_per_household_min: 2 };
    const f = fitScore(c, X(1), null);
    expect(f.score).toBe(75);
    expect(f.met).toEqual(["price_max", "approval_year_min", "household_count_min"]);
    expect(f.unmet).toEqual(["parking_per_household_min"]);
    expect(f.within_budget).toBeNull();
  });
  it("no conditions scores 100", () => expect(fitScore(C, X(1), null).score).toBe(100));
  it("missing is separate from unmet", () => {
    const f = fitScore({ ...C, household_count_min: 300 }, X(1, { household_count: null }), null);
    expect(f.unmet).toEqual(["household_count_min"]);
    expect(f.missing).toEqual(["household_count_min"]);
  });
  it("area has no missing", () => {
    const f = fitScore({ ...C, area_min: 60 }, X(1, { deal_count: 0 }), null);
    expect(f.unmet).toEqual(["area"]);
    expect(f.missing).toEqual([]);
  });
});

describe("rankComplexes", () => {
  it("excludes must failures", () => {
    const c = { ...C, household_count_min: 300, priorities: { household_count_min: "must" as const } };
    const r = rankComplexes(c, [X(1, { household_count: 100 }), X(2)], B(null), 10);
    expect(r.map((x) => x.complex_id)).toEqual([2]);
  });
  it("ranks by score then budget then price", () => {
    const rows = [
      X(1, { median_price: 900_000_000 }), // 예산 초과
      X(2, { median_price: 700_000_000 }), // 예산 내, 비쌈
      X(3, { median_price: 400_000_000 }), // 예산 내, 쌈
    ];
    const r = rankComplexes(C, rows, B(800_000_000), 10);
    expect(r.map((x) => x.complex_id)).toEqual([3, 2, 1]);
    expect(r.map((x) => x.fit.within_budget)).toEqual([true, true, false]);
  });
  it("score outranks budget", () => {
    const c = { ...C, household_count_min: 300 };
    const rows = [X(1, { household_count: 100, median_price: 1 }), X(2, { median_price: 900_000_000 })];
    expect(rankComplexes(c, rows, B(800_000_000), 10).map((x) => x.complex_id)).toEqual([2, 1]);
  });
  it("ranks null median last", () => {
    const r = rankComplexes(C, [X(1, { median_price: null }), X(2, { median_price: 900_000_000 })], B(null), 10);
    expect(r.map((x) => x.complex_id)).toEqual([2, 1]);
    expect(r[1].fit.within_budget).toBeNull();
    const r2 = rankComplexes(C, [X(1, { median_price: null }), X(2)], B(800_000_000), 10);
    expect(r2[1].fit.within_budget).toBeNull();
  });
  it("respects limit", () => {
    expect(rankComplexes(C, [X(1), X(2), X(3)], B(null), 2)).toHaveLength(2);
  });
});

describe("neighborStats", () => {
  const rows = [3, 5, 4, null].map((m, i) => X(i + 1, { median_price: m === null ? null : m * 100_000_000 }));
  it("ranks target", () => {
    expect(neighborStats(2, rows)).toEqual({ count: 4, priced: 3, dong_median: 400_000_000, rank: 3 });
  });
  it("null target has no rank", () => expect(neighborStats(4, rows).rank).toBeNull());
});

describe("distance conditions", () => {
  const c = { ...C, station_distance_max_m: 1000 };
  it("distance missing when no location", () => {
    expect(fitScore(c, X(1), null).missing).toEqual(["station_distance_max"]);
    expect(fitScore(c, X(1, { nearest_station_m: 500 }), null).met).toEqual(["station_distance_max"]);
  });
  it("rankComplexes drops distance must when no row has poi data", () => {
    const m = { ...c, priorities: { station_distance_max: "must" as const } };
    const r = rankComplexes(m, [X(1), X(2)], [], 10);
    expect(r).toHaveLength(2);
    expect(r[0].fit.score).toBe(100);
  });
});
