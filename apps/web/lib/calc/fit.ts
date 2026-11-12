// 4단계 후보 단지 적합도·순위·같은 동 가격 비교. 순수 함수 (M4a-D2, D3).
import { activeKeys, meets, priorityOf } from "./conditions";
import type { ComplexRow, ConditionKey, Conditions, RegionBudget } from "./conditions";

export interface Fit {
  score: number; met: ConditionKey[]; unmet: ConditionKey[]; missing: ConditionKey[];
  within_budget: boolean | null;
}
export type RankedComplex = ComplexRow & { fit: Fit };
export interface NeighborStats { count: number; priced: number; dong_median: number | null; rank: number | null }

// 값 자체가 null이라 판단 못 한 조건. area는 거래 0건이 unmet일 뿐 missing이 아니다
const VALUE: Record<Exclude<ConditionKey, "area">, keyof ComplexRow> = {
  price_max: "median_price", approval_year_min: "approval_year", household_count_min: "household_count",
  parking_per_household_min: "parking_per_household", floor_area_ratio_max: "floor_area_ratio",
  station_distance_max: "nearest_station_m", elementary_distance_max: "nearest_elementary_m",
};

export function fitScore(c: Conditions, x: ComplexRow, maxBudget: number | null, active = activeKeys(c)): Fit {
  const met = active.filter((k) => meets(c, k, x));
  const unmet = active.filter((k) => !met.includes(k));
  const missing = unmet.filter((k) => k !== "area" && x[VALUE[k]] === null);
  return {
    score: active.length ? Math.round((100 * met.length) / active.length) : 100,
    met, unmet, missing,
    within_budget: x.median_price === null || maxBudget === null ? null : x.median_price <= maxBudget,
  };
}

const budgetOrder = (b: boolean | null) => (b === true ? 0 : b === null ? 1 : 2);

export const maxBudgetFor = (budgets: RegionBudget[], x: ComplexRow) =>
  budgets.find((b) => b.sigungu_code === x.region_code.slice(0, 5))?.max_budget ?? null;

export function rankComplexes(c: Conditions, rows: ComplexRow[], budgets: RegionBudget[], limit: number): RankedComplex[] {
  const active = activeKeys(c, rows);
  const musts = active.filter((k) => priorityOf(c, k) === "must");
  return rows
    .filter((x) => musts.every((k) => meets(c, k, x)))
    .map((x) => ({ ...x, fit: fitScore(c, x, maxBudgetFor(budgets, x), active) }))
    .sort((a, b) => b.fit.score - a.fit.score
      || budgetOrder(a.fit.within_budget) - budgetOrder(b.fit.within_budget)
      || (a.median_price ?? Infinity) - (b.median_price ?? Infinity)
      || a.complex_id - b.complex_id)
    .slice(0, limit);
}

export function neighborStats(targetId: number, rows: ComplexRow[]): NeighborStats {
  const prices = rows.map((r) => r.median_price).filter((v): v is number => v !== null).sort((a, b) => a - b);
  const mid = prices.length >> 1;
  const dong_median = !prices.length ? null : prices.length % 2 ? prices[mid] : Math.round((prices[mid - 1] + prices[mid]) / 2);
  const t = rows.find((r) => r.complex_id === targetId)?.median_price ?? null;
  return { count: rows.length, priced: prices.length, dong_median, rank: t === null ? null : 1 + prices.filter((p) => p < t).length };
}
