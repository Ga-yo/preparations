import { test, expect } from "vitest";
import { brokerageFee } from "./brokerage";

test.each([
  [30_000_000, 180_000], [100_000_000, 500_000], [190_000_000, 800_000],
  [500_000_000, 2_000_000], [1_000_000_000, 5_000_000], [2_000_000_000, 14_000_000],
])("중개보수 상한 %i원 → %i원", (price, fee) => expect(brokerageFee(price).fee).toBe(fee));

test("한도 적용 시 capped", () => {
  expect(brokerageFee(190_000_000)).toMatchObject({ ratePct: 0.5, capped: true });
  expect(brokerageFee(500_000_000)).toMatchObject({ ratePct: 0.4, capped: false });
});

test("분수 요율에서도 정수 정확", () => {
  expect(brokerageFee(11_000).fee).toBe(66); // 0.6%
  expect(brokerageFee(1_501_000_000).fee).toBe(10_507_000); // 0.7%
  expect(brokerageFee(11_000_000_000).fee).toBe(77_000_000);
});
test.each([
  [49_999_999, 0.6, 250_000], [50_000_000, 0.5, 250_000],
  [199_999_999, 0.5, 800_000], [200_000_000, 0.4, 800_000],
  [899_999_999, 0.4, 3_599_999], [900_000_000, 0.5, 4_500_000],
  [1_199_999_999, 0.5, 5_999_999], [1_200_000_000, 0.6, 7_200_000],
  [1_499_999_999, 0.6, 8_999_999], [1_500_000_000, 0.7, 10_500_000],
])("경계 %i원 -> 요율 %f%%, %i원", (price, ratePct, fee) => {
  expect(brokerageFee(price)).toMatchObject({ ratePct, fee });
});
