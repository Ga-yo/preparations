import { expect, test } from "vitest";
import { findConflicts, type ComplexRow, type Conditions, type RegionBudget } from "./conditions";

const cond = (o: Partial<Conditions> = {}): Conditions => ({
  housing_types: ["apartment"], price_min: null, price_max: null, area_min: null, area_max: null,
  approval_year_min: null, household_count_min: null, parking_per_household_min: null,
  floor_area_ratio_max: null, mgmt_fee_per_m2_max: null, station_distance_max_m: null, elementary_distance_max_m: null, rooms_min: null, baths_min: null,
  floor_pref: null, direction_pref: null, priorities: {}, ...o,
});
let nextId = 1;
const cx = (o: Partial<ComplexRow> = {}): ComplexRow => ({
  complex_id: nextId++, name: "단지", region_code: "1168010300", approval_year: 2000, household_count: 500,
  parking_per_household: 1, floor_area_ratio: 200, building_coverage_ratio: 20, land_share_m2: 40,
  median_price: 800_000_000, deal_count: 3,
  nearest_station_name: null, nearest_station_m: null, nearest_elementary_m: null, ...o,
});
const budget = (max_budget: number | null, median_price = 800_000_000, sigungu_code = "11680"): RegionBudget =>
  ({ sigungu_code, max_budget, median_price });

test("희망 최저가가 모든 지역 예산보다 높으면 price_min_over_budget", () => {
  const r = findConflicts(cond({ price_min: 900_000_000 }), [budget(700_000_000), budget(800_000_000, 1, "11650")], [cx()], false);
  expect(r.conflicts).toContainEqual({ code: "price_min_over_budget", budget_max: 800_000_000 });
});

test("최고가만 예산 초과면 price_max_over_budget만", () => {
  const r = findConflicts(cond({ price_min: 500_000_000, price_max: 1_000_000_000 }), [budget(800_000_000)], [cx()], false);
  expect(r.conflicts).toEqual([{ code: "price_max_over_budget", budget_max: 800_000_000 }]);
});

test("1단계 미저장(예산 null)이면 예산 충돌 없음", () => {
  const r = findConflicts(cond({ price_min: 9e9, price_max: 9e9 }), [budget(null)], [cx()], false);
  expect(r.conflicts).toEqual([]);
});

test("must 두 개가 함께면 0개, 하나씩 빼면 후보가 생김 → 둘 다 blocking", () => {
  const rows = [cx({ approval_year: 2018, household_count: 300 }), cx({ approval_year: 1990, household_count: 1500 })];
  const r = findConflicts(cond({
    approval_year_min: 2015, household_count_min: 1000,
    priorities: { approval_year_min: "must", household_count_min: "must" },
  }), [], rows, false);
  expect(r.counts.must).toBe(0);
  expect(r.conflicts).toEqual([{ code: "no_match_for_musts", blocking: ["approval_year_min", "household_count_min"] }]);
});

test("빼도 여전히 0개인 must는 blocking에 없음", () => {
  const rows = [cx({ approval_year: 2018, household_count: 300, floor_area_ratio: 300 })];
  const r = findConflicts(cond({
    approval_year_min: 2015, household_count_min: 1000, floor_area_ratio_max: 200,
    priorities: { approval_year_min: "must", household_count_min: "must", floor_area_ratio_max: "must" },
  }), [], rows, false);
  expect(r.conflicts).toEqual([{ code: "no_match_for_musts", blocking: [] }]);
});

test("prefer는 must 수에 영향 없고 counts.prefer에만, 우선순위 미지정은 prefer", () => {
  const rows = [cx({ household_count: 1200 }), cx({ household_count: 300 }), cx({ household_count: 400 }),
    cx({ household_count: 500 }), cx({ household_count: 600 })];
  const r = findConflicts(cond({ household_count_min: 1000 }), [], rows, false);
  expect(r.counts).toEqual({ total: 5, must: 5, prefer: { household_count_min: 1 } });
  expect(r.conflicts).toEqual([]);
});

test("ignore 조건은 계산하지 않음", () => {
  const r = findConflicts(cond({ household_count_min: 1000, priorities: { household_count_min: "ignore" } }), [], [cx()], false);
  expect(r.counts.prefer).toEqual({});
  expect(r.counts.must).toBe(1);
});

test("must 가격: 거래 없는 단지는 미충족", () => {
  const rows = [cx({ median_price: null, deal_count: 0 }), cx({ median_price: 700_000_000 })];
  const r = findConflicts(cond({ price_max: 750_000_000, priorities: { price_max: "must" } }), [], rows, false);
  expect(r.counts.must).toBe(1);
});

test("must 면적: 면적 범위 거래가 없는 단지(deal_count 0)는 미충족", () => {
  const rows = [cx({ deal_count: 0, median_price: null }), cx(), cx(), cx(), cx(), cx()];
  const r = findConflicts(cond({ area_min: 80, area_max: 90, priorities: { area: "must" } }), [], rows, false);
  expect(r.counts.must).toBe(5);
});

test("must 충족 1~4개면 few_matches_for_musts, matches는 중위가 오름차순·null 뒤", () => {
  const a = cx({ median_price: null, deal_count: 0, household_count: 2000 });
  const b = cx({ median_price: 900_000_000, household_count: 2000 });
  const c = cx({ median_price: 600_000_000, household_count: 2000 });
  const r = findConflicts(cond({ household_count_min: 1000, priorities: { household_count_min: "must" } }),
    [], [a, b, c, cx({ household_count: 10 })], false);
  expect(r.conflicts).toEqual([{ code: "few_matches_for_musts", count: 3 }]);
  expect(r.matches.map((m) => m.complex_id)).toEqual([c.complex_id, b.complex_id, a.complex_id]);
});

test("모든 희망 지역 면적 중위가가 최고가 초과일 때만 area_price_mismatch", () => {
  const all = findConflicts(cond({ price_max: 700_000_000 }),
    [budget(null, 900_000_000, "11680"), budget(null, 800_000_000, "11650")], [cx()], false);
  expect(all.conflicts).toContainEqual({ code: "area_price_mismatch", sigungu_codes: ["11680", "11650"] });
  const one = findConflicts(cond({ price_max: 700_000_000 }),
    [budget(null, 900_000_000, "11680"), budget(null, 600_000_000, "11650")], [cx()], false);
  expect(one.conflicts.some((c) => c.code === "area_price_mismatch")).toBe(false);
});

test("단지 데이터가 없으면 충돌 없이 no_complex_data", () => {
  const r = findConflicts(cond({ household_count_min: 1000, priorities: { household_count_min: "must" } }), [], [], false);
  expect(r.conflicts).toEqual([]);
  expect(r.notices).toEqual(["no_complex_data"]);
});

test("데이터 없는 조건과 잘림 안내", () => {
  const r = findConflicts(cond({
    housing_types: ["apartment", "officetel"], mgmt_fee_per_m2_max: 3000, rooms_min: 3,
  }), [], [cx()], true);
  expect(r.notices).toEqual(["no_data_for_type", "data_unavailable:mgmt_fee", "unit_level_condition", "truncated", "land_share_is_average"]);
});

test("matches는 최대 20개", () => {
  const rows = Array.from({ length: 25 }, () => cx());
  expect(findConflicts(cond(), [], rows, false).matches).toHaveLength(20);
});

test("같은 입력이면 같은 출력", () => {
  const rows = [cx({ median_price: 5 }), cx({ median_price: 5 }), cx({ median_price: 1 })];
  const c = cond({ household_count_min: 100, priorities: { household_count_min: "must" } });
  expect(findConflicts(c, [], [...rows].reverse(), false)).toEqual(findConflicts(c, [], rows, false));
});

test("distance musts filter and leave-one-out", () => {
  const rows = [cx({ nearest_station_m: 600, nearest_elementary_m: 1500 }), cx({ nearest_station_m: 1500, nearest_elementary_m: 1500 })];
  const st = cond({ station_distance_max_m: 1000, priorities: { station_distance_max: "must" } });
  expect(findConflicts(st, [], rows, false).counts.must).toBe(1);
  const both = cond({ station_distance_max_m: 1000, elementary_distance_max_m: 500,
    priorities: { station_distance_max: "must", elementary_distance_max: "must" } });
  const r = findConflicts(both, [], rows, false);
  expect(r.conflicts).toContainEqual({ code: "no_match_for_musts", blocking: ["elementary_distance_max"] });
});

test("location_partial notice when some rows lack location", () => {
  const rows = [cx({ nearest_station_m: 600 }), cx()];
  const c = cond({ station_distance_max_m: 1000 });
  expect(findConflicts(c, [], rows, false).notices).toContain("location_partial");
  expect(findConflicts(cond(), [], rows, false).notices).not.toContain("location_partial");
});

test("no_poi_data when pois empty", () => {
  const c = cond({ station_distance_max_m: 1000, priorities: { station_distance_max: "must" } });
  const r = findConflicts(c, [], [cx(), cx()], false);
  expect(r.notices).toContain("no_poi_data");
  expect(r.notices).not.toContain("location_partial");
  expect(r.conflicts.map((x) => x.code)).not.toContain("no_match_for_musts");
  expect(r.counts.must).toBe(2);
});

test("only schools missing: elementary must ignored with no_poi_data, station must still filters", () => {
  const c = cond({ station_distance_max_m: 1000, elementary_distance_max_m: 500,
    priorities: { station_distance_max: "must", elementary_distance_max: "must" } });
  const rows = [cx({ nearest_station_m: 400 }), cx({ nearest_station_m: 2000 })];
  const r = findConflicts(c, [], rows, false);
  expect(r.counts.must).toBe(1);
  expect(r.notices).toContain("no_poi_data");
  expect(r.conflicts.map((x) => x.code)).not.toContain("no_match_for_musts");
});
