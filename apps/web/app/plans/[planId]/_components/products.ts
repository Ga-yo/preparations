import type { BudgetResult } from "@/lib/calc/budget";

export type ProductPayment = BudgetResult["products"][number];

// 월 상환액(최저 금리 기준) 적은 순, 같으면 최고 금리 기준 적은 순. 상환액을 모르면 뒤로(원래 순서 유지)
export function byMonthly(products: ProductPayment[]): ProductPayment[] {
  // null끼리는 0(Infinity - Infinity = NaN을 피한다)
  const cmp = (a: number | null, b: number | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a - b);
  return [...products].sort((a, b) => cmp(a.monthlyAtMin, b.monthlyAtMin) || cmp(a.monthlyAtMax, b.monthlyAtMax));
}
