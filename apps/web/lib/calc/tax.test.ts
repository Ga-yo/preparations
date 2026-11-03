import { test, expect } from "vitest";
import { acquisitionTax } from "./tax";

const base = { exclusiveAreaM2: 84, houseCountAfter: 1, inAdjustmentArea: false, isFirstTime: false, date: "2026-11-03" };

test("5억 1주택 84㎡", () =>
  expect(acquisitionTax({ ...base, price: 500_000_000 })).toMatchObject({
    acquisitionTax: 5_000_000, localEducationTax: 500_000, ruralSpecialTax: 0, total: 5_500_000, heavyTax: false,
  }));
test("7.5억은 2% 구간", () => expect(acquisitionTax({ ...base, price: 750_000_000 }).acquisitionTax).toBe(15_000_000));
test("10억 100㎡는 3% + 교육세 0.3% + 농특세 0.2%", () =>
  expect(acquisitionTax({ ...base, price: 1_000_000_000, exclusiveAreaM2: 100 }).total).toBe(35_000_000));
// 법 제151조 제3호: 취득세 감면율만큼 지방교육세도 감면 -> 브리프의 3_500_000과 다름(법령 기준 3_300_000)
test("생애최초 감면 200만원 한도 (교육세 비례 감면)", () =>
  expect(acquisitionTax({ ...base, price: 500_000_000, isFirstTime: true })).toMatchObject({
    firstTimeRelief: 2_000_000, localEducationTax: 300_000, total: 3_300_000,
  }));
test("생애최초 12억 초과는 감면 없음", () =>
  expect(acquisitionTax({ ...base, price: 1_300_000_000, isFirstTime: true }).firstTimeRelief).toBe(0));
test("생애최초 일몰 이후는 감면 0", () =>
  expect(acquisitionTax({ ...base, price: 500_000_000, isFirstTime: true, date: "2029-01-01" }).firstTimeRelief).toBe(0));
test("조정지역 2주택은 중과 8% (교육세 0.4%)", () =>
  expect(acquisitionTax({ ...base, price: 500_000_000, houseCountAfter: 2, inAdjustmentArea: true })).toMatchObject({
    acquisitionTax: 40_000_000, localEducationTax: 2_000_000, ruralSpecialTax: 0, heavyTax: true,
  }));
test("조정지역 3주택 12%, 100㎡ 농특세 1.0%", () =>
  expect(acquisitionTax({ ...base, price: 500_000_000, houseCountAfter: 3, inAdjustmentArea: true, exclusiveAreaM2: 100 })).toMatchObject({
    acquisitionTax: 60_000_000, ruralSpecialTax: 5_000_000, heavyTax: true,
  }));
test("비조정 2주택은 중과 아님, 3주택 8%, 4주택 12%", () => {
  const p = { ...base, price: 500_000_000 };
  expect(acquisitionTax({ ...p, houseCountAfter: 2 })).toMatchObject({ acquisitionTax: 5_000_000, heavyTax: false });
  expect(acquisitionTax({ ...p, houseCountAfter: 3 })).toMatchObject({ acquisitionTax: 40_000_000, heavyTax: true });
  expect(acquisitionTax({ ...p, houseCountAfter: 4 }).acquisitionTax).toBe(60_000_000);
});
