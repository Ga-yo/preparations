import { expect, test } from "vitest";
import { maxLoan, maxPrincipalByDsr, monthlyPayment } from "./loan";

test("원리금균등 월 상환액", () => {
  expect(monthlyPayment(300_000_000, 4, 30)).toBe(1_432_246);
  expect(monthlyPayment(120_000_000, 0, 10)).toBe(1_000_000);
});

test("DSR 기반 최대 원금", () => {
  // 연소득 1억, DSR 40% → 연 4천만 여력, 금리 4% + 스트레스 1.5%, 30년
  const p = maxPrincipalByDsr({
    annualIncome: 100_000_000,
    existingAnnualPayment: 0,
    dsrPct: 40,
    annualRatePct: 4,
    stressRatePct: 1.5,
    termYears: 30,
  });
  expect(12 * monthlyPayment(p, 5.5, 30)).toBeLessThanOrEqual(40_000_000);
  expect(12 * monthlyPayment(p + 1_000_000, 5.5, 30)).toBeGreaterThan(
    40_000_000,
  );
});

test("소득 0이면 0", () => {
  expect(
    maxPrincipalByDsr({
      annualIncome: 0,
      existingAnnualPayment: 0,
      dsrPct: 40,
      annualRatePct: 4,
      stressRatePct: 0,
      termYears: 30,
    }),
  ).toBe(0);
});

test("기존 상환액이 한도 초과면 0 (음수 아님)", () => {
  expect(
    maxPrincipalByDsr({
      annualIncome: 50_000_000,
      existingAnnualPayment: 30_000_000,
      dsrPct: 40,
      annualRatePct: 4,
      stressRatePct: 0,
      termYears: 30,
    }),
  ).toBe(0);
});

test("maxLoan은 가장 작은 제약을 binding으로", () => {
  expect(
    maxLoan({
      price: 1_000_000_000,
      ltvPct: 40,
      capWon: 600_000_000,
      dsrPrincipal: 900_000_000,
    }),
  ).toEqual({
    amount: 400_000_000,
    binding: "ltv",
  });
  expect(
    maxLoan({
      price: 1_000_000_000,
      ltvPct: 70,
      capWon: 600_000_000,
      dsrPrincipal: 900_000_000,
    }),
  ).toEqual({
    amount: 600_000_000,
    binding: "loan_cap",
  });
  expect(
    maxLoan({
      price: 1_000_000_000,
      ltvPct: 70,
      capWon: null,
      dsrPrincipal: 300_000_000,
    }),
  ).toEqual({
    amount: 300_000_000,
    binding: "dsr",
  });
});
