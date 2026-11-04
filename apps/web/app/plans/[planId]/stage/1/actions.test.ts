import { describe, expect, test } from "vitest";
import { financialProfileSchema } from "./actions";

const base = { purpose: "live", timeline: "1y", cash_assets: "20000", annual_income: "6000", owned_house_count: "0" };

describe("financialProfileSchema", () => {
  test("만원 → 원 변환", () => expect(financialProfileSchema.parse(base).cash_assets).toBe(200_000_000));
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
