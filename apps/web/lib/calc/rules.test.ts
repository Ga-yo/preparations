import { expect, test } from "vitest";
import { activeAreaTypes, buyerTypeOf, selectRule } from "./rules";
import type { LoanRule, RegulatedArea } from "./types";

const rule = (o: Partial<LoanRule> = {}): LoanRule => ({
  id: 1,
  rule_type: "ltv",
  area_type: null,
  region_prefix: null,
  buyer_type: null,
  lender_type: null,
  price_min: null,
  price_max: null,
  value: 70,
  unit: "percent",
  effective_date: "2025-01-01",
  end_date: null,
  source: "test",
  source_url: null,
  note: null,
  ...o,
});
const area = (region_code: string, o: Partial<RegulatedArea> = {}): RegulatedArea => ({
  id: 1,
  region_code,
  area_type: "adjustment_target",
  effective_date: "2025-01-01",
  end_date: null,
  source: "test",
  source_url: null,
  note: null,
  ...o,
});
const ctx = {
  date: "2026-11-03",
  price: 1_000_000_000,
  buyerType: "homeless" as const,
  areaTypes: [] as never[],
  regionCode: "1168010100",
  lenderType: "bank" as const,
};

test("기간 밖 규칙은 무시", () => {
  expect(selectRule([rule({ effective_date: "2026-12-01" })], "ltv", ctx)).toBeNull();
  expect(selectRule([rule({ end_date: "2026-11-02" })], "ltv", ctx)).toBeNull();
});

test("구체적 규칙 우선: 규제지역+생애최초 LTV가 일반 LTV를 이긴다", () => {
  const r = selectRule(
    [rule({ value: 70 }), rule({ value: 80, area_type: "regulated", buyer_type: "first_time" })],
    "ltv",
    { ...ctx, buyerType: "first_time", areaTypes: ["adjustment_target"] },
  );
  expect(r?.value).toBe(80);
});

test("동률이면 effective_date 최신", () => {
  const r = selectRule(
    [rule({ value: 60, effective_date: "2025-01-01" }), rule({ value: 50, effective_date: "2026-01-01" })],
    "ltv",
    ctx,
  );
  expect(r?.value).toBe(50);
});

test("homeless 규칙은 first_time에도 적용", () => {
  const rules = [rule({ buyer_type: "homeless" })];
  expect(selectRule(rules, "ltv", { ...ctx, buyerType: "first_time" })).not.toBeNull();
  expect(selectRule(rules, "ltv", { ...ctx, buyerType: "one_house" })).toBeNull();
});

test("first_time 규칙은 homeless에 적용 안 됨", () => {
  expect(selectRule([rule({ buyer_type: "first_time" })], "ltv", ctx)).toBeNull();
});

test("가격 구간: price_max는 미만", () => {
  const rules = [
    rule({ value: 80, price_max: 1_500_000_000 }),
    rule({ value: 50, price_min: 1_500_000_000 }),
  ];
  expect(selectRule(rules, "ltv", { ...ctx, price: 1_499_999_999 })?.value).toBe(80);
  expect(selectRule(rules, "ltv", { ...ctx, price: 1_500_000_000 })?.value).toBe(50);
});

test("area_type: regulated / non_regulated / 구체 유형", () => {
  const reg = [rule({ area_type: "regulated" })];
  expect(selectRule(reg, "ltv", ctx)).toBeNull();
  expect(selectRule(reg, "ltv", { ...ctx, areaTypes: ["speculation_zone"] })).not.toBeNull();
  const non = [rule({ area_type: "non_regulated" })];
  expect(selectRule(non, "ltv", ctx)).not.toBeNull();
  expect(selectRule(non, "ltv", { ...ctx, areaTypes: ["speculation_zone"] })).toBeNull();
  const spec = [rule({ area_type: "speculation_zone" })];
  expect(selectRule(spec, "ltv", { ...ctx, areaTypes: ["adjustment_target"] })).toBeNull();
  expect(selectRule(spec, "ltv", { ...ctx, areaTypes: ["speculation_zone"] })).not.toBeNull();
});

test("region_prefix, lender_type, rule_type 필터", () => {
  expect(selectRule([rule({ region_prefix: "11" })], "ltv", ctx)).not.toBeNull();
  expect(selectRule([rule({ region_prefix: "26" })], "ltv", ctx)).toBeNull();
  expect(selectRule([rule({ region_prefix: "11" })], "ltv", { ...ctx, regionCode: null })).toBeNull();
  expect(selectRule([rule({ lender_type: "non_bank" })], "ltv", ctx)).toBeNull();
  expect(selectRule([rule({ rule_type: "dsr" })], "ltv", ctx)).toBeNull();
});

test("적용 규칙이 없으면 null", () => {
  expect(selectRule([], "ltv", ctx)).toBeNull();
});

test("activeAreaTypes: 시도·시군구·읍면동 수준 매칭", () => {
  const d = "2026-11-03";
  expect(activeAreaTypes("1168010100", [area("1100000000")], d)).toEqual(["adjustment_target"]);
  expect(activeAreaTypes("1168010100", [area("1168000000")], d)).toEqual(["adjustment_target"]);
  expect(activeAreaTypes("2644010100", [area("1100000000")], d)).toEqual([]);
  // 이천시 지정이 안성시를 잡으면 안 됨
  expect(activeAreaTypes("4155025000", [area("4150000000")], d)).toEqual([]);
  expect(activeAreaTypes("4150012345", [area("4150000000")], d)).toEqual(["adjustment_target"]);
  // 수원시 지정은 일반구 하위 동 포함
  expect(activeAreaTypes("4111110100", [area("4111000000")], d)).toEqual(["adjustment_target"]);
  expect(activeAreaTypes("4113110100", [area("4111000000")], d)).toEqual([]);
  // 읍면동·정확 일치
  expect(activeAreaTypes("1168010100", [area("1168010100")], d)).toEqual(["adjustment_target"]);
  expect(activeAreaTypes("1168010101", [area("1168010100")], d)).toEqual(["adjustment_target"]);
  expect(activeAreaTypes("1168010200", [area("1168010100")], d)).toEqual([]);
});

test("activeAreaTypes: 해제일 이후·시행 전 제외, 중복 제거", () => {
  const a = area("1168000000", { end_date: "2026-11-02" });
  expect(activeAreaTypes("1168010100", [a], "2026-11-03")).toEqual([]);
  expect(activeAreaTypes("1168010100", [a], "2026-11-02")).toEqual(["adjustment_target"]);
  expect(activeAreaTypes("1168010100", [area("1168000000", { effective_date: "2027-01-01" })], "2026-11-03")).toEqual([]);
  expect(
    activeAreaTypes("1168010100", [area("1100000000"), area("1168000000")], "2026-11-03"),
  ).toEqual(["adjustment_target"]);
});

test("buyerTypeOf", () => {
  expect(buyerTypeOf({ ownedHouseCount: 0, isFirstTime: true })).toBe("first_time");
  expect(buyerTypeOf({ ownedHouseCount: 0, isFirstTime: false })).toBe("homeless");
  expect(buyerTypeOf({ ownedHouseCount: 0, isFirstTime: null })).toBe("homeless");
  expect(buyerTypeOf({ ownedHouseCount: 1, isFirstTime: null })).toBe("one_house");
  expect(buyerTypeOf({ ownedHouseCount: 2, isFirstTime: null })).toBe("multi_house");
});
