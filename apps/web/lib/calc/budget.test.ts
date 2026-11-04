import { expect, test } from "vitest";
import { computeBudget, eligibleProducts, type BudgetInput } from "./budget";
import type { LoanProduct, LoanRule } from "./types";

const rule = (rule_type: string, value: number, o: Partial<LoanRule> = {}): LoanRule => ({
  id: 1, rule_type, area_type: null, region_prefix: null, buyer_type: null, lender_type: null,
  price_min: null, price_max: null, value, unit: rule_type === "loan_cap" ? "won" : "percent",
  effective_date: "2025-01-01", end_date: null, source: `src-${rule_type}`, source_url: null, note: null, ...o,
});
const product = (o: Partial<LoanProduct> = {}): LoanProduct => ({
  id: 1, provider: "A은행", name: "주담대", product_type: "bank", rate_type: "variable",
  rate_min: 4, rate_max: 5, max_amount: null, max_term_years: null, income_max: null,
  house_price_max: null, exclusive_area_max: null, asset_max: null, requires_first_time: false,
  requires_homeless: false, requires_newlywed: false, requires_newborn: false,
  effective_date: "2025-01-01", end_date: null, data_as_of: "2026-11-01", source: "t",
  source_url: null, source_key: null, note: null, ...o,
});
const input: BudgetInput = {
  date: "2026-11-03", cashAssets: 150_000_000, extraFunds: 50_000_000, annualIncome: 100_000_000,
  existingDebt: 0, existingAnnualPayment: 0, ownedHouseCount: 0, isFirstTime: false, isNewlywed: false,
  hasNewborn: false, regionCode: null, exclusiveAreaM2: 59,
  rules: [rule("ltv", 70), rule("dsr", 40), rule("stress_rate", 1.5)],
  areas: [], products: [product()],
};

test("자기자본 2억, 소득 1억 무주택: 필요자금이 자기자본 이하인 최대 가격", () => {
  const r = computeBudget(input);
  const need = r.maxPrice - r.loan.amount + r.costs.total;
  expect(need).toBeLessThanOrEqual(200_000_000);
  expect(r.maxPrice).toBeGreaterThan(0);
  expect(r.maxPrice % 1_000_000).toBe(0);
  expect(r.maxPrice).toBe(r.minRatePrice);
  // 한 칸 위 가격은 자기자본을 넘는다(최대성)
  const up = computeBudget({ ...input, cashAssets: 150_000_000 - 1 });
  expect(up.maxPrice).toBeLessThanOrEqual(r.maxPrice);
});
test("금리가 높으면 예산이 같거나 낮다", () => {
  const r = computeBudget(input);
  expect(r.maxRatePrice).toBeLessThanOrEqual(r.minRatePrice);
  const wide = computeBudget({ ...input, products: [product({ rate_min: 3, rate_max: 8 })] });
  expect(wide.maxRatePrice).toBeLessThan(wide.minRatePrice);
});
test("소득 없음 → 대출 0, missing_income", () => {
  for (const annualIncome of [null, 0]) {
    const r = computeBudget({ ...input, annualIncome });
    expect(r.loan.amount).toBe(0);
    expect(r.diagnoses).toContain("missing_income");
  }
});
test("규칙 없음 → 대출 0, rule_missing (LTV 100% 가정 금지)", () => {
  const r = computeBudget({ ...input, rules: [] });
  expect(r.loan.amount).toBe(0);
  expect(r.diagnoses).toEqual(expect.arrayContaining(["rule_missing", "funds_only"]));
});
test("스트레스 금리 규칙 없음 → 대출 0, rule_missing (가산 0 가정 금지)", () => {
  const r = computeBudget({ ...input, rules: [rule("ltv", 70), rule("dsr", 40)] });
  expect(r.loan.amount).toBe(0);
  expect(r.diagnoses).toEqual(expect.arrayContaining(["rule_missing", "funds_only"]));
});
test("적격 은행 상품 없음 → 대출 0, 금리를 지어내지 않는다", () => {
  const r = computeBudget({ ...input, products: [] });
  expect(r.loan.amount).toBe(0);
  expect(r.diagnoses).toEqual(expect.arrayContaining(["no_eligible_product", "funds_only"]));
});
test("자금이 최소 단계도 못 사면 maxPrice 0", () => {
  const r = computeBudget({ ...input, cashAssets: 0, extraFunds: 0, rules: [] });
  expect(r.maxPrice).toBe(0);
});
test("결과에 소득·자산 원값 키가 없다", () => {
  expect(JSON.stringify(computeBudget(input))).not.toMatch(/annualIncome|cashAssets/);
});
test("규칙 출처 중복 제거, 다주택은 heavy_tax_possible", () => {
  const r = computeBudget({ ...input, ownedHouseCount: 2 });
  expect(r.diagnoses).toContain("heavy_tax_possible");
  expect(new Set(r.ruleSources).size).toBe(r.ruleSources.length);
  expect(new Set(r.diagnoses).size).toBe(r.diagnoses.length);
});
test("상품 목록: 은행·정책 포함, 월상환액", () => {
  const r = computeBudget({
    ...input,
    products: [product(), product({ id: 2, product_type: "policy", name: "정책", rate_min: null, rate_max: null, max_amount: 100_000_000 })],
  });
  expect(r.products).toHaveLength(2);
  expect(r.products[0]!.monthlyAtMin).toBeGreaterThan(0);
  expect(r.products[1]!.monthlyAtMin).toBeNull();
  expect(r.products[1]!.loanAmount).toBeLessThanOrEqual(100_000_000);
});

const ep = { date: "2026-11-03", price: 500_000_000, annualIncome: 50_000_000, buyerType: "homeless" as const, isNewlywed: false, hasNewborn: false, exclusiveAreaM2: 59, ownFunds: 100_000_000 };
test("신혼 전용 정책상품은 신혼이 아니면 제외", () => {
  const p = product({ requires_newlywed: true });
  expect(eligibleProducts([p], ep)).toHaveLength(0);
  expect(eligibleProducts([p], { ...ep, isNewlywed: true })).toHaveLength(1);
});
test("소득 상한 초과 상품 제외", () => {
  const p = product({ income_max: 40_000_000 });
  expect(eligibleProducts([p], ep)).toHaveLength(0);
  expect(eligibleProducts([p], { ...ep, annualIncome: null })).toHaveLength(0);
});
test("기간·가격·면적·자산·생애최초 조건", () => {
  expect(eligibleProducts([product({ end_date: "2026-01-01" })], ep)).toHaveLength(0);
  expect(eligibleProducts([product({ house_price_max: 400_000_000 })], ep)).toHaveLength(0);
  expect(eligibleProducts([product({ exclusive_area_max: 50 })], ep)).toHaveLength(0);
  expect(eligibleProducts([product({ asset_max: 50_000_000 })], ep)).toHaveLength(0);
  expect(eligibleProducts([product({ requires_first_time: true })], ep)).toHaveLength(0);
  expect(eligibleProducts([product({ requires_homeless: true })], { ...ep, buyerType: "one_house" })).toHaveLength(0);
});

test("지역 미지정이면 region_unspecified, 지정하면 없음", () => {
  expect(computeBudget(input).diagnoses).toContain("region_unspecified");
  expect(computeBudget({ ...input, regionCode: "11680" }).diagnoses).not.toContain("region_unspecified");
});

test("기존 부채가 있는데 연 상환액이 없으면 debt_payment_missing", () => {
  const d = (o: Partial<BudgetInput>) => computeBudget({ ...input, ...o }).diagnoses;
  expect(d({ existingDebt: 10_000_000, existingAnnualPayment: null })).toContain("debt_payment_missing");
  expect(d({ existingDebt: 10_000_000, existingAnnualPayment: 1_000_000 })).not.toContain("debt_payment_missing");
  expect(d({ existingDebt: 0, existingAnnualPayment: null })).not.toContain("debt_payment_missing");
});

test("대출 0원이면 상품 목록은 비고, 대출이 있으면 rateType을 담는다", () => {
  expect(computeBudget({ ...input, annualIncome: null }).products).toEqual([]);
  expect(computeBudget(input).products[0]!.rateType).toBe("variable");
});
