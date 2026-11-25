import { widenAreaMax, type ComplexRow, type Conditions, type RegionBudget } from "@/lib/calc/conditions";
import { applyParkingDefault, lifeNotices, tieBreakers, weightsFor, type LifePrefs } from "@/lib/calc/preferences";
import { commuteTarget, type CommuteTarget } from "@/lib/route/commute";
import type { ToolContext } from "../tool";
import { getRegionPrices } from "./get-region-prices";

const DATASET = "complexes:building_ledger";
const DATASETS = [DATASET, "complexes:location", "pois:subway_station", "pois:school", "pois:park", "complexes:shops"];
export const MONTHS = 12;
const MAX_ROWS = 3000; // RPC는 잘림을 알리려고 한 행 더 준다

// complexes_for_conditions에 넘기는 출퇴근 기준: 지역 코드 또는 지하철역 이름(둘 중 하나)
export type CommuteArgs = { commute_code?: string; commute_station?: string };
export type ConditionContext = {
  conditions: Conditions; conditionSetId: string; regionCodes: string[]; commute: CommuteArgs; commuteTarget: CommuteTarget | null; redevelopmentInterest: boolean;
  budgets: RegionBudget[]; rows: ComplexRow[]; truncated: boolean;
  as_of: Record<string, string>; stale?: string[]; notices?: string[];
};

// 최신 condition_sets + 예산 + 지역 단지 행을 읽는다. RPC 오류는 throw
// offset: 0이면 최신 세트, 1이면 직전 세트(5단계 조건 변경 비교)
export async function loadConditionContext(ctx: ToolContext, offset = 0): Promise<ConditionContext | { error: "region_required" | "conditions_required" }> {
  const { supabase, planId } = ctx;
  const { data: c, error } = await supabase
    .from("condition_sets").select("*").eq("plan_id", planId)
    .order("created_at", { ascending: false }).range(offset, offset).maybeSingle();
  if (error) throw new Error(error.message);
  if (!c?.region_codes?.length) return { error: "region_required" };
  const conditions: Conditions = {
    housing_types: c.housing_types, price_min: c.price_min, price_max: c.price_max,
    area_min: c.area_min, area_max: widenAreaMax(c.area_max), approval_year_min: c.approval_year_min,
    household_count_min: c.household_count_min, parking_per_household_min: c.parking_per_household_min,
    floor_area_ratio_max: c.floor_area_ratio_max,
    station_distance_max_m: c.station_distance_max_m, elementary_distance_max_m: c.elementary_distance_max_m,
    rooms_min: c.rooms_min, baths_min: c.baths_min, floor_pref: c.floor_pref, direction_pref: c.direction_pref,
    priorities: (c.priorities ?? {}) as Conditions["priorities"],
  };
  const prefs: LifePrefs = {
    uses_transit: c.uses_transit ?? null, school_importance: c.school_importance ?? null, infra_importance: c.infra_importance ?? null,
    parking_required: c.parking_required ?? null,
  };
  const stage3Empty = !conditions.housing_types.length && [conditions.price_min, conditions.price_max,
    conditions.area_min, conditions.area_max, conditions.approval_year_min, conditions.household_count_min,
    conditions.parking_per_household_min, conditions.floor_area_ratio_max,
    conditions.station_distance_max_m, conditions.elementary_distance_max_m].every((v) => v === null);
  if (stage3Empty) return { error: "conditions_required" };
  // 2단계 생활 조건은 3단계 조건이 있을 때만 점수·정렬에 얹는다 (M6-D3)
  const scored: Conditions = { ...applyParkingDefault(conditions, prefs), weights: weightsFor(prefs), ties: tieBreakers(prefs) };
  const commute: CommuteArgs = c.commute_station ? { commute_station: c.commute_station } : c.commute_region_code ? { commute_code: c.commute_region_code } : {};
  const hasCommute = Object.keys(commute).length > 0;

  const [prices, rpc, fresh] = await Promise.all([
    getRegionPrices.run({}, ctx),
    supabase.rpc("complexes_for_conditions", {
      region_codes: c.region_codes, months: MONTHS,
      ...(c.area_min !== null && { area_min: c.area_min }),
      ...(conditions.area_max !== null && { area_max: conditions.area_max }),
      ...commute,
    }),
    supabase.from("data_freshness").select("dataset, as_of").in("dataset", DATASETS),
  ]);
  if (rpc.error) throw new Error(rpc.error.message);
  if (fresh.error) throw new Error(fresh.error.message);

  const regionRows = ((prices.data as { regions?: { sigungu_code: string; median_price: number; max_budget?: number }[] }).regions ?? []);
  const budgets: RegionBudget[] = regionRows.map((r) => ({
    sigungu_code: r.sigungu_code, median_price: r.median_price, max_budget: r.max_budget ?? null,
  }));
  const all = (rpc.data ?? []) as ComplexRow[];
  const notices = [...(prices.notices ?? []), ...lifeNotices(prefs, all), ...(hasCommute ? ["commute_is_straight_line"] : [])];
  return {
    conditions: scored, conditionSetId: c.id, regionCodes: c.region_codes, budgets,
    commute,
    commuteTarget: commuteTarget({ uses_transit: c.uses_transit ?? null, commute_station: c.commute_station ?? null, commute_region_code: c.commute_region_code ?? null }),
    redevelopmentInterest: c.redevelopment_interest ?? false,
    rows: all.slice(0, MAX_ROWS), truncated: all.length > MAX_ROWS,
    as_of: { ...prices.as_of, ...Object.fromEntries((fresh.data ?? []).map((f) => [f.dataset, f.as_of])) },
    ...(prices.stale?.length && { stale: prices.stale }),
    ...(notices.length && { notices }),
  };
}
