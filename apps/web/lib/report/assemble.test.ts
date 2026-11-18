import { expect, test } from "vitest";
import { assembleReport, conditionsSummary } from "./assemble";

const budget = { data: { ownFunds: 1 }, as_of: { loan_rules: "2025-07-01" }, notices: ["recheck_regulation"] };
const compare = { data: { items: [] }, as_of: { "transactions:apartment": "2026-11-13" }, notices: ["land_share_is_average", "recheck_regulation"] };
const base = { generated_on: "2026-11-14", budget, conditions: null, favorites: [{ complex_id: 1, name: "a" }, { complex_id: 2, name: "b" }], compare, checklist: [] };

test("merges data dates and dedupes notices", () => {
  const r = assembleReport(base);
  expect(r.version).toBe(1);
  expect(r.as_of).toEqual({ loan_rules: "2025-07-01", "transactions:apartment": "2026-11-13" });
  expect(r.notices).toEqual(["recheck_regulation", "land_share_is_average"]);
});

test("fewer than two favorites has no compare", () => {
  const r = assembleReport({ ...base, favorites: [{ complex_id: 1, name: "a" }], compare: null });
  expect(r.compare).toBeNull();
  expect(r.notices).toContain("need_two_favorites");
});

test("conditions summary keeps only report fields", () => {
  const row = { region_codes: ["1168000000"], region_reason: "직장", commute_region_code: "1114000000", area_min: 59, area_max: 85,
    price_max: 900_000_000, redevelopment_interest: true, household_size: 3 };
  const names = { "1168000000": "서울특별시 강남구", "1114000000": "서울특별시 중구" };
  expect(conditionsSummary(row, names)).toEqual({
    region_names: ["서울특별시 강남구"], region_reason: "직장", commute_region_name: "서울특별시 중구",
    area_min: 59, area_max: 85, price_max: 900_000_000, redevelopment_interest: true,
  });
  expect(conditionsSummary(null, names)).toBeNull();
});
