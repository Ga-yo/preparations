import { describe, expect, test } from "vitest";
import { financialProfileSchema } from "./actions";

const base = { purpose: "live", timeline: "1y", cash_assets: "20000", annual_income: "6000", owned_house_count: "0" };

describe("financialProfileSchema", () => {
  test("만원 → 원 변환", () => expect(financialProfileSchema.parse(base).cash_assets).toBe(200_000_000));
  test("천 단위 콤마는 빼고 읽는다", () => {
    expect(financialProfileSchema.parse({ ...base, annual_income: "6,000" }).annual_income).toBe(60_000_000);
    expect(financialProfileSchema.parse({ ...base, cash_assets: "1,234,567" }).cash_assets).toBe(12_345_670_000);
  });
  test("콤마 외 문자는 여전히 거부", () => expect(financialProfileSchema.safeParse({ ...base, cash_assets: "6천" }).success).toBe(false));
  test("빈 금액은 null", () => expect(financialProfileSchema.parse({ ...base, extra_funds: "" }).extra_funds).toBeNull());
  test("음수 금액 거부", () => expect(financialProfileSchema.safeParse({ ...base, cash_assets: "-1" }).success).toBe(false));
  test("purpose는 live|invest|both만", () => {
    expect(financialProfileSchema.safeParse({ ...base, purpose: "rent" }).success).toBe(false);
    for (const p of ["live", "invest", "both"]) expect(financialProfileSchema.safeParse({ ...base, purpose: p }).success).toBe(true);
  });
  test("timeline 제한", () => expect(financialProfileSchema.safeParse({ ...base, timeline: "5y" }).success).toBe(false));
  test("owned_house_count는 0 이상 정수", () => {
    expect(financialProfileSchema.safeParse({ ...base, owned_house_count: "-1" }).success).toBe(false);
    expect(financialProfileSchema.safeParse({ ...base, owned_house_count: "1.5" }).success).toBe(false);
  });
  test("체크박스: on → true, 없음 → false", () => {
    const r = financialProfileSchema.parse({ ...base, is_first_time: "on" });
    expect([r.is_first_time, r.is_newlywed]).toEqual([true, false]);
  });
});

test("구매 목적·시기는 필수: 비었거나 없으면 거부", () => {
  for (const k of ["purpose", "timeline"] as const) {
    expect(financialProfileSchema.safeParse({ ...base, [k]: "" }).success).toBe(false);
    const { [k]: _, ...rest } = base;
    expect(financialProfileSchema.safeParse(rest).success).toBe(false);
  }
});

describe("부채 보유 여부 체크박스", () => {
  const debt = { existing_debt: "5000", existing_debt_annual_payment: "600" };
  test("체크 안 하면 숨은 부채 입력칸 값은 버리고 0으로 저장", () => {
    const r = financialProfileSchema.parse({ ...base, ...debt });
    expect([r.existing_debt, r.existing_debt_annual_payment]).toEqual([0, 0]);
  });
  test("체크하면(on) 입력값을 쓴다", () => {
    const r = financialProfileSchema.parse({ ...base, has_debt: "on", ...debt });
    expect([r.existing_debt, r.existing_debt_annual_payment]).toEqual([50_000_000, 6_000_000]);
  });
  test("체크했는데 연간 원리금 상환액이 비면 거부(DSR에 필요)", () => {
    const r = financialProfileSchema.safeParse({ ...base, has_debt: "on", existing_debt: "5000" });
    expect(r.error?.issues[0].path).toEqual(["existing_debt_annual_payment"]);
  });
  test("has_debt는 DB 컬럼이 아니라 결과에 남지 않는다", () => {
    expect(financialProfileSchema.parse({ ...base, has_debt: "on", ...debt })).not.toHaveProperty("has_debt");
  });
});
