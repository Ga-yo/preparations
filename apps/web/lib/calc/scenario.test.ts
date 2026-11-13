import { describe, expect, it } from "vitest";
import type { ComplexRow, Conditions } from "./conditions";
import type { RankedComplex } from "./fit";
import { diffConditions, diffRankings } from "./scenario";

const C: Conditions & { region_codes: string[] } = {
  housing_types: ["apartment"], price_min: null, price_max: 900_000_000, area_min: 80, area_max: 90,
  approval_year_min: null, household_count_min: 1000, parking_per_household_min: null,
  floor_area_ratio_max: null, mgmt_fee_per_m2_max: null, station_distance_max_m: null, elementary_distance_max_m: null,
  rooms_min: null, baths_min: null, floor_pref: null, direction_pref: null,
  priorities: { area: "must" }, region_codes: ["1168000000"],
};
const R = (id: number): RankedComplex => ({
  complex_id: id, name: `c${id}`, region_code: "1168010100", approval_year: 2000, household_count: 500,
  parking_per_household: 1, floor_area_ratio: 200, building_coverage_ratio: 20, land_share_m2: 30,
  median_price: 5e8, deal_count: 3, nearest_station_name: null, nearest_station_m: null, nearest_elementary_m: null,
  fit: { score: 100, met: [], unmet: [], missing: [], within_budget: null },
} satisfies ComplexRow & { fit: unknown });

describe("diffConditions", () => {
  it("detects changed fields", () => {
    expect(diffConditions(C, { ...C, price_max: 1e9, region_codes: ["1165000000"] }).sort()).toEqual(["price_max", "region_codes"]);
  });
  it("priority change is a field", () => {
    expect(diffConditions(C, { ...C, priorities: { area: "prefer" } })).toEqual(["priorities.area"]);
  });
  it("priority added counts", () => {
    expect(diffConditions(C, { ...C, priorities: { area: "must", price_max: "must" } })).toEqual(["priorities.price_max"]);
  });
  it("no change returns empty", () => {
    expect(diffConditions(C, { ...C, housing_types: ["apartment"], region_codes: ["1168000000"] })).toEqual([]);
  });
});

describe("diffRankings", () => {
  it("ranking diff added removed moved", () => {
    const d = diffRankings([R(1), R(2), R(3)], [R(2), R(1), R(4)]);
    expect(d.added).toEqual([{ complex_id: 4, name: "c4", rank: 3 }]);
    expect(d.removed).toEqual([{ complex_id: 3, name: "c3", rank: 3 }]);
    expect(d.moved).toEqual([{ complex_id: 2, name: "c2", from: 2, to: 1 }, { complex_id: 1, name: "c1", from: 1, to: 2 }]);
    expect([d.count_before, d.count_after]).toEqual([3, 3]);
  });
});
