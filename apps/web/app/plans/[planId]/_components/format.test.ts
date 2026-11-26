import { expect, test } from "vitest";
import { walkMinutes } from "@/lib/calc/walk";
import { caretAfterDigits, formatEokShort, formatWon, groupDigits, livingText, nearestTies, placeText } from "./format";

test.each([
  [0, "0원"], [9_999, "9,999원"], [10_000, "1만원"], [100_000_000, "1억원"],
  [526_000_000, "5억 2,600만원"], [199_995_000, "2억원"], [404_150_000, "4억 415만원"],
])("formatWon(%i) = %s", (n, s) => expect(formatWon(n)).toBe(s));

test("livingText joins known values only", () => {
  expect(livingText({ nearest_park_name: "도곡공원", nearest_park_m: 210, shop_count_500m: 42 }))
    .toBe(`가까운 공원 도곡공원(210m), 약 도보 ${walkMinutes(210)}분 · 반경 500m 생활 상가 42곳`);
  expect(livingText({ nearest_park_name: null, nearest_park_m: 210, shop_count_500m: null })).toBe(`가까운 공원 공원(210m), 약 도보 ${walkMinutes(210)}분`);
  expect(livingText({ nearest_park_name: null, nearest_park_m: null, shop_count_500m: null })).toBeNull();
});

test("placeText: 1km 넘으면 km, 도보 60분 이상이면 거리만", () => {
  expect(placeText("가초", 620)).toBe(`가초(620m), 약 도보 ${walkMinutes(620)}분`);
  expect(placeText("먼초", 1500)).toBe(`먼초(1.5km), 약 도보 ${walkMinutes(1500)}분`);
  expect(walkMinutes(3600)).toBeGreaterThanOrEqual(60);
  expect(placeText("아주먼초", 3600)).toBe("아주먼초(3.6km)");
});

test("nearestTies: 도보 분이 같은 곳만 보이고 나머지는 외 n개", () => {
  const rows = [{ name: "가", distance_m: 400 }, { name: "나", distance_m: 410 }, { name: "다", distance_m: 900 }];
  expect(walkMinutes(400)).toBe(walkMinutes(410));
  expect(nearestTies(rows, 5)).toEqual({ shown: rows.slice(0, 2), more: 3 });
  expect(nearestTies([], 0)).toEqual({ shown: [], more: 0 });
  expect(nearestTies(rows.slice(2), 0)).toEqual({ shown: rows.slice(2), more: 0 }); // 1km 밖이면 total 0
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
