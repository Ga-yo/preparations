import { expect, test } from "vitest";
import { formatWon, livingText } from "./format";

test.each([
  [0, "0원"], [9_999, "9,999원"], [10_000, "1만원"], [100_000_000, "1억원"],
  [526_000_000, "5억 2,600만원"], [199_995_000, "2억원"], [404_150_000, "4억 415만원"],
])("formatWon(%i) = %s", (n, s) => expect(formatWon(n)).toBe(s));

test("livingText joins known values only", () => {
  expect(livingText({ commute_m: 3140, nearest_park_m: 210, shop_count_500m: 42 }))
    .toBe("출퇴근 지역까지 직선 3.1km · 공원 직선 210m · 반경 500m 생활 상가 42곳");
  expect(livingText({ commute_m: 800, nearest_park_m: null, shop_count_500m: 0 })).toBe("출퇴근 지역까지 직선 800m · 반경 500m 생활 상가 0곳");
  expect(livingText({ commute_m: null, nearest_park_m: null, shop_count_500m: null })).toBeNull();
});
