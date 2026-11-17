import { expect, test } from "vitest";
import { byMonthly } from "./products";

const p = (productId: number, monthlyAtMin: number | null, monthlyAtMax: number | null = monthlyAtMin) =>
  ({ productId, provider: "A", name: "n", rateType: null, loanAmount: 1, monthlyAtMin, monthlyAtMax, termYears: 30 });

test("월 상환액(최저) 적은 순, 같으면 최고 상환액 적은 순", () => {
  expect(byMonthly([p(1, 200), p(2, 150, 190), p(3, 150, 170)]).map((x) => x.productId)).toEqual([3, 2, 1]);
});
test("월 상환액을 모르는 상품은 맨 뒤, 원래 순서 유지", () => {
  expect(byMonthly([p(1, null), p(2, 300), p(3, null), p(4, 100)]).map((x) => x.productId)).toEqual([4, 2, 1, 3]);
});
test("원본 배열을 바꾸지 않는다", () => {
  const src = [p(1, 2), p(2, 1)];
  byMonthly(src);
  expect(src.map((x) => x.productId)).toEqual([1, 2]);
});
