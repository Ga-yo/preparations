import { expect, test } from "vitest";
import { debtPaymentRatio, ownFunds } from "./funds";

test("ownFunds: 보유 현금 + 추가 자금, 빈 값은 0", () => {
  expect(ownFunds(14_000, 3_000)).toBe(17_000);
  expect(ownFunds(null, 3_000)).toBe(3_000);
  expect(ownFunds(null, null)).toBe(0);
});

test("debtPaymentRatio: 연간 상환액 ÷ 연 소득 × 100", () => {
  expect(debtPaymentRatio(462, 6_000)).toBeCloseTo(7.7);
  expect(debtPaymentRatio(null, 6_000)).toBe(0);
});

test("debtPaymentRatio: 소득이 없거나 0이면 계산하지 않는다", () => {
  expect(debtPaymentRatio(300, null)).toBeNull();
  expect(debtPaymentRatio(300, 0)).toBeNull();
});
