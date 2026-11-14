// 5단계 관심 단지 비교 표와 위험 요소. 순수 함수 (M5-D3, D6).
import type { ComplexRow } from "./conditions";
import type { Fit } from "./fit";

export type RiskCode = "over_budget" | "budget_unknown" | "few_trades" | "no_recent_trades"
  | "old_building" | "no_location" | "outside_conditions" | "redevelopment_in_zone";
export type Metric = "median_price" | "fit_score" | "approval_year" | "household_count"
  | "parking_per_household" | "land_share_m2" | "nearest_station_m" | "nearest_elementary_m";
export interface CompareInput { row: ComplexRow; fit: Fit | null; max_budget: number | null; in_conditions: boolean }
export interface CompareItem {
  complex_id: number; name: string; fit: Fit | null; risks: RiskCode[];
  price_gap_from_min: number | null;
  budget_ratio: number | null;
}
export interface CompareResult { items: CompareItem[]; best: Partial<Record<Metric, number[]>> }

const OLD_YEARS = 30;
const LOWER_IS_BETTER: Metric[] = ["median_price", "nearest_station_m", "nearest_elementary_m"];
const METRICS: Metric[] = ["median_price", "fit_score", "approval_year", "household_count",
  "parking_per_household", "land_share_m2", "nearest_station_m", "nearest_elementary_m"];

const valueOf = (x: CompareInput, m: Metric): number | null => (m === "fit_score" ? x.fit?.score ?? null : x.row[m]);

export function riskFlags(x: CompareInput, todayYear: number): RiskCode[] {
  const r = x.row;
  const risks: RiskCode[] = [];
  if (x.max_budget === null) risks.push("budget_unknown");
  else if (r.median_price !== null && r.median_price > x.max_budget) risks.push("over_budget");
  if (r.deal_count === 0) risks.push("no_recent_trades");
  else if (r.deal_count <= 2) risks.push("few_trades");
  if (r.approval_year !== null && todayYear - r.approval_year >= OLD_YEARS) risks.push("old_building");
  if (r.nearest_station_m === null && r.nearest_elementary_m === null) risks.push("no_location");
  if (!x.in_conditions) risks.push("outside_conditions");
  return risks;
}

export function compareComplexes(inputs: CompareInput[], todayYear: number): CompareResult {
  const prices = inputs.map((x) => x.row.median_price).filter((v): v is number => v !== null);
  const minPrice = prices.length ? Math.min(...prices) : null;
  const items = inputs.map((x): CompareItem => {
    const p = x.row.median_price;
    return {
      complex_id: x.row.complex_id, name: x.row.name, fit: x.fit, risks: riskFlags(x, todayYear),
      price_gap_from_min: p === null || minPrice === null ? null : p - minPrice,
      budget_ratio: p === null || !x.max_budget ? null : Math.round((p / x.max_budget) * 100) / 100,
    };
  });
  const best: CompareResult["best"] = {};
  for (const m of METRICS) {
    const vals = inputs.map((x) => [x.row.complex_id, valueOf(x, m)] as const).filter((e): e is readonly [number, number] => e[1] !== null);
    if (vals.length < 2) continue;
    const target = LOWER_IS_BETTER.includes(m) ? Math.min(...vals.map((e) => e[1])) : Math.max(...vals.map((e) => e[1]));
    best[m] = vals.filter((e) => e[1] === target).map((e) => e[0]);
  }
  return { items, best };
}
