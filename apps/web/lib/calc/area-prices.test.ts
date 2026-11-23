import { describe, expect, it } from "vitest";
import { defaultArea, latestMonthChange, monthKeys, monthlySeries } from "./area-prices";

const keys = monthKeys("2026-11-23", 12);
const series = (rows: [string, number, number][]) => monthlySeries(rows.map(([month, median_price, deal_count]) => ({ month, median_price, deal_count })), keys);

describe("monthKeys", () => {
  it("covers the 12 calendar months ending this month, oldest first", () => {
    expect(keys).toHaveLength(12);
    expect(keys[0]).toBe("2025-12");
    expect(keys[11]).toBe("2026-11");
  });
  it("crosses the year boundary", () => {
    expect(monthKeys("2026-01-05", 3)).toEqual(["2025-11", "2025-12", "2026-01"]);
  });
});

describe("monthlySeries", () => {
  it("drops rows outside keys and leaves empty months null", () => {
    const s = series([["2025-11", 1, 1], ["2026-10", 640000000, 1]]);
    expect(s).toHaveLength(12);
    expect(s.map((p) => p.month)).not.toContain("2025-11");
    expect(s[10].median_price).toBe(640000000);
    expect(s[11]).toEqual({ month: "2026-11", median_price: null, deal_count: 0 });
  });
});

describe("latestMonthChange", () => {
  it("59㎡: same price two months in a row is 0%", () => {
    const c = latestMonthChange(series([["2026-10", 640000000, 1], ["2026-11", 640000000, 2]]));
    expect(c).toMatchObject({ month: "2026-11", latest_month: "2026-11", change_pct: 0, prev_month: "2026-10", prev_median: 640000000 });
  });
  it("84㎡: only October → no change when September is empty", () => {
    const c = latestMonthChange(series([["2026-10", 700000000, 4]]));
    expect(c).toMatchObject({ latest_month: "2026-11", month: "2026-10", prev_month: "2026-09", prev_median: null, prev_count: 0, change_pct: null, deal_count: 4 });
  });
  it("rounds to one decimal", () => {
    expect(latestMonthChange(series([["2026-09", 749000000, 1], ["2026-10", 640000000, 1]]))?.change_pct).toBe(-14.6);
  });
  it("prev month across the year boundary", () => {
    const k = monthKeys("2026-01-10", 3);
    const c = latestMonthChange(monthlySeries([{ month: "2025-12", median_price: 100, deal_count: 1 }, { month: "2026-01", median_price: 110, deal_count: 1 }], k));
    expect(c).toMatchObject({ prev_month: "2025-12", change_pct: 10 });
  });
  it("a tiny drop rounds to 0, not -0", () => {
    expect(Object.is(latestMonthChange(series([["2026-10", 1000000000, 1], ["2026-11", 999900000, 1]]))?.change_pct, 0)).toBe(true);
  });
  it("all empty → null", () => {
    expect(latestMonthChange(series([]))).toBeNull();
  });
});

describe("defaultArea", () => {
  it("picks the most-traded area, smaller on ties, null when empty", () => {
    expect(defaultArea([{ area: 84, deal_count: 4 }, { area: 59, deal_count: 12 }])).toBe(59);
    expect(defaultArea([{ area: 84, deal_count: 2 }, { area: 59, deal_count: 2 }])).toBe(59);
    expect(defaultArea([])).toBeNull();
  });
});
