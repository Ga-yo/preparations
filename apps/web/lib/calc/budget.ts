import { brokerageFee } from "./brokerage";
import { maxLoan, maxPrincipalByDsr, monthlyPayment } from "./loan";
import { activeAreaTypes, buyerTypeOf, selectRule } from "./rules";
import { acquisitionTax } from "./tax";
import type { BuyerType, LoanProduct, LoanRule, RegulatedArea } from "./types";

export const DEFAULT_TERM_YEARS = 30;
const SCAN_TOP = 5_000_000_000;
const SCAN_STEP = 1_000_000;

export type BudgetInput = {
  date: string;
  cashAssets: number;
  extraFunds: number;
  annualIncome: number | null;
  existingAnnualPayment: number;
  ownedHouseCount: number;
  isFirstTime: boolean | null;
  isNewlywed: boolean | null;
  hasNewborn: boolean | null;
  regionCode: string | null;
  exclusiveAreaM2: number;
  rules: LoanRule[];
  areas: RegulatedArea[];
  products: LoanProduct[];
};

export type Diagnosis =
  | "missing_income"
  | "rule_missing"
  | "dsr_binding"
  | "ltv_binding"
  | "cap_binding"
  | "heavy_tax_possible"
  | "no_eligible_product"
  | "funds_only";

export type BudgetResult = {
  maxPrice: number;
  minRatePrice: number;
  maxRatePrice: number;
  loan: { amount: number; binding: "ltv" | "loan_cap" | "dsr" };
  ownFunds: number;
  costs: { acquisitionTax: number; brokerage: number; total: number };
  products: Array<{
    productId: number;
    provider: string;
    name: string;
    loanAmount: number;
    monthlyAtMin: number | null;
    monthlyAtMax: number | null;
    termYears: number;
  }>;
  diagnoses: Diagnosis[];
  ruleSources: string[];
};

export function eligibleProducts(
  products: LoanProduct[],
  p: {
    date: string;
    price: number;
    annualIncome: number | null;
    buyerType: BuyerType;
    isNewlywed: boolean | null;
    hasNewborn: boolean | null;
    exclusiveAreaM2: number;
    ownFunds: number;
  },
): LoanProduct[] {
  return products.filter(
    (x) =>
      x.effective_date <= p.date &&
      (x.end_date === null || p.date <= x.end_date) &&
      (!x.requires_first_time || p.buyerType === "first_time") &&
      (!x.requires_homeless || p.buyerType === "first_time" || p.buyerType === "homeless") &&
      (!x.requires_newlywed || p.isNewlywed === true) &&
      (!x.requires_newborn || p.hasNewborn === true) &&
      // 소득 정보가 없으면 상한 있는 상품은 보수적으로 제외
      (x.income_max === null || (p.annualIncome !== null && p.annualIncome <= x.income_max)) &&
      (x.house_price_max === null || p.price <= x.house_price_max) &&
      (x.exclusive_area_max === null || p.exclusiveAreaM2 <= x.exclusive_area_max) &&
      // shortcut: asset_max를 순자산이 아닌 자기자본과 비교, 정책상품 자산요건 정의 확정 시 보정
      (x.asset_max === null || p.ownFunds <= x.asset_max),
  );
}

export function computeBudget(input: BudgetInput): BudgetResult {
  const ownFunds = input.cashAssets + input.extraFunds;
  const buyerType = buyerTypeOf(input);
  const houseCountAfter = input.ownedHouseCount + 1;
  const areaTypes = input.regionCode ? activeAreaTypes(input.regionCode, input.areas, input.date) : [];
  const inAdjustmentArea = areaTypes.includes("adjustment_target");
  const income = input.annualIncome !== null && input.annualIncome > 0 ? input.annualIncome : null;

  const at = (price: number, pick: "min" | "max") => {
    const ctx = { date: input.date, price, buyerType, areaTypes, regionCode: input.regionCode, lenderType: "bank" as const };
    const ltv = selectRule(input.rules, "ltv", ctx);
    const dsr = selectRule(input.rules, "dsr", ctx);
    const cap = selectRule(input.rules, "loan_cap", ctx);
    const stress = selectRule(input.rules, "stress_rate", ctx);
    const elig = eligibleProducts(input.products, {
      date: input.date, price, annualIncome: input.annualIncome, buyerType,
      isNewlywed: input.isNewlywed, hasNewborn: input.hasNewborn,
      exclusiveAreaM2: input.exclusiveAreaM2, ownFunds,
    });
    const bank = elig.filter((x) => x.product_type === "bank");
    const rates = bank.flatMap((x) => (pick === "min" ? [x.rate_min ?? x.rate_max] : [x.rate_max ?? x.rate_min]));
    const known = rates.filter((r): r is number => r !== null);
    const rate = known.length === 0 ? null : pick === "min" ? Math.min(...known) : Math.max(...known);

    let loan: BudgetResult["loan"] = { amount: 0, binding: "ltv" };
    if (income !== null && ltv && dsr && stress && rate !== null) {
      loan = maxLoan({
        price,
        ltvPct: ltv.value,
        capWon: cap?.value ?? null,
        dsrPrincipal: maxPrincipalByDsr({
          annualIncome: income, existingAnnualPayment: input.existingAnnualPayment,
          dsrPct: dsr.value, annualRatePct: rate, stressRatePct: stress.value,
          termYears: DEFAULT_TERM_YEARS,
        }),
      });
    }
    const tax = acquisitionTax({
      price, exclusiveAreaM2: input.exclusiveAreaM2, houseCountAfter, inAdjustmentArea,
      isFirstTime: buyerType === "first_time", date: input.date,
    });
    const brokerage = brokerageFee(price).fee;
    const costs = { acquisitionTax: tax.total, brokerage, total: tax.total + brokerage };
    return {
      price, loan, costs, elig, rate, heavyTax: tax.heavyTax,
      used: [ltv, dsr, cap, stress].filter((r): r is LoanRule => r !== null),
      // 스트레스 금리 행이 없으면 가산 0으로 가정하지 않는다(한도 과대 방지)
      ruleMissing: !ltv || !dsr || !stress, noProduct: rate === null,
      need: price - loan.amount + costs.total,
    };
  };

  // 가격대별 한도가 계단식이라 단조성이 없으므로 위에서 아래로 스캔한다.
  const scan = (pick: "min" | "max") => {
    for (let p = SCAN_TOP; p >= SCAN_STEP; p -= SCAN_STEP) {
      const e = at(p, pick);
      if (e.need <= ownFunds) return e;
    }
    return at(0, pick);
  };
  const lo = scan("min");
  const hi = scan("max");

  const diagnoses = new Set<Diagnosis>();
  if (income === null) diagnoses.add("missing_income");
  if (lo.ruleMissing) diagnoses.add("rule_missing");
  if (income !== null && !lo.ruleMissing && lo.noProduct) diagnoses.add("no_eligible_product");
  if (lo.loan.amount === 0) diagnoses.add("funds_only");
  else
    diagnoses.add(({ dsr: "dsr_binding", ltv: "ltv_binding", loan_cap: "cap_binding" } as const)[lo.loan.binding]);
  if (houseCountAfter >= 2) diagnoses.add("heavy_tax_possible");

  const toProduct = (x: LoanProduct) => {
    const termYears = x.max_term_years !== null && x.max_term_years > 0 ? x.max_term_years : DEFAULT_TERM_YEARS;
    const loanAmount = Math.min(lo.loan.amount, x.max_amount ?? Infinity);
    const m = (r: number | null) => (r === null ? null : monthlyPayment(loanAmount, r, termYears));
    return { productId: x.id, provider: x.provider, name: x.name, loanAmount, monthlyAtMin: m(x.rate_min), monthlyAtMax: m(x.rate_max), termYears };
  };

  return {
    maxPrice: lo.price,
    minRatePrice: lo.price,
    maxRatePrice: hi.price,
    loan: lo.loan,
    ownFunds,
    costs: lo.costs,
    products: lo.elig.map(toProduct),
    diagnoses: [...diagnoses],
    ruleSources: [...new Set(lo.used.map((r) => r.source))],
  };
}
