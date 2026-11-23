import { expect, test } from "vitest";
import { assembleReport, conditionsSummary, pickChecklist } from "./assemble";

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

const tips = [
  { field_key: "checklist", title: "서류", body: "b", caution: null },
  { field_key: "next_steps", title: "절차", body: "b", caution: null },
  { field_key: "redevelopment", title: "정비구역", body: "b", caution: null },
];
const inZone = { data: { items: [{ risks: ["few_trades"] }, { risks: ["redevelopment_in_zone"] }] } };

test("정비구역 안 관심 단지가 있을 때만 정비구역 안내를 담는다", () => {
  expect(pickChecklist(tips, inZone).map((t) => t.title)).toEqual(["서류", "절차", "정비구역"]);
  expect(pickChecklist(tips, { data: { items: [{ risks: ["few_trades"] }] } }).map((t) => t.title)).toEqual(["서류", "절차"]);
});

test("비교가 없거나 실패하면 정비구역 안내를 빼고 나머지는 그대로", () => {
  expect(pickChecklist(tips, null).map((t) => t.title)).toEqual(["서류", "절차"]);
  expect(pickChecklist(tips, { data: { error: "need_two_or_more" } }).map((t) => t.title)).toEqual(["서류", "절차"]);
});
