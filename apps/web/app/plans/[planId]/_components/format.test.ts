import { expect, test } from "vitest";
import { caretAfterDigits, formatEokShort, formatWon, groupDigits, livingText } from "./format";

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

test.each([
  ["", ""], ["0", "0"], ["6000", "6,000"], ["1234567", "1,234,567"], ["006000", "6,000"], ["6,0a00", "6,000"],
])("groupDigits(%j) = %j", (raw, out) => expect(groupDigits(raw)).toBe(out));

test("caretAfterDigits: n번째 숫자 바로 뒤 위치(콤마는 건너뜀)", () => {
  expect(caretAfterDigits("1,234,567", 0)).toBe(0);
  expect(caretAfterDigits("1,234,567", 1)).toBe(1);
  expect(caretAfterDigits("1,234,567", 2)).toBe(3);
  expect(caretAfterDigits("1,234,567", 7)).toBe(9);
});

test.each([
  [456_000_000, "4.6억"], [576_000_000, "5.8억"], [400_000_000, "4억"], [1_234_000_000, "12.3억"],
  [95_000_000, "9,500만"], [99_990_000, "9,999만"], [100_000_000, "1억"],
])("formatEokShort(%i) = %s", (n, s) => expect(formatEokShort(n)).toBe(s));
