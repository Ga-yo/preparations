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
