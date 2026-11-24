import { describe, expect, it } from "vitest";
import { monthKeys, monthlySeries } from "@/lib/calc/area-prices";
import { chartGeometry } from "./price-chart";

const keys = monthKeys("2026-11-23", 12);
const series = (vals: Record<string, number>) =>
  monthlySeries(Object.entries(vals).map(([month, median_price]) => ({ month, median_price, deal_count: 2 })), keys);

describe("chartGeometry", () => {
  it("breaks the line at empty months (F1 59㎡)", () => {
    const g = chartGeometry(series({ "2025-12": 6e8, "2026-02": 6.1e8, "2026-04": 6.2e8, "2026-05": 6.3e8, "2026-06": 6.2e8, "2026-07": 6.4e8, "2026-10": 6.4e8, "2026-11": 6.4e8 }), 392, 180);
    expect(g.points).toHaveLength(8);
    expect(g.segments).toHaveLength(2);
    expect(g.segments[0].startsWith("M")).toBe(true);
    expect(g.bars).toHaveLength(8);
  });
  it("single value: no line, ticks wrap ±50M", () => {
    const g = chartGeometry(series({ "2026-10": 7.3e8 }), 392, 180);
    expect(g.segments).toHaveLength(0);
    expect(g.yTicks).toHaveLength(3);
    expect(g.yTicks[0].value).toBeLessThanOrEqual(6.8e8);
    expect(g.yTicks[2].value).toBeGreaterThanOrEqual(7.8e8);
  });
  it("empty series: nothing to draw", () => {
    const g = chartGeometry(series({}), 392, 180);
    expect(g.points).toEqual([]);
    expect(g.segments).toEqual([]);
  });
  it("equal values share y and produce no NaN", () => {
    const g = chartGeometry(series({ "2026-10": 6.4e8, "2026-11": 6.4e8 }), 392, 180);
    expect(g.points[0].y).toBe(g.points[1].y);
    expect(JSON.stringify(g)).not.toContain("NaN");
  });
  it("bars scale to the busiest month with a 4px floor", () => {
    const s = monthlySeries([{ month: "2026-10", median_price: 1e8, deal_count: 1 }, { month: "2026-11", median_price: 1e8, deal_count: 100 }], keys);
    const g = chartGeometry(s, 392, 180);
    expect(g.bars[0].h).toBe(4);
    expect(g.bars[1].h).toBeGreaterThan(g.bars[0].h);
  });
});
