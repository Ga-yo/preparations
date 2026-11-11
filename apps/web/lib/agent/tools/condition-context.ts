import type { ComplexRow, Conditions, RegionBudget } from "@/lib/calc/conditions";
import type { ToolContext } from "../tool";
import { getRegionPrices } from "./get-region-prices";

const DATASET = "complexes:building_ledger";
export const MONTHS = 12;
const MAX_ROWS = 3000; // RPC는 잘림을 알리려고 한 행 더 준다

export type ConditionContext = {
  conditions: Conditions; conditionSetId: string; regionCodes: string[];
  budgets: RegionBudget[]; rows: ComplexRow[]; truncated: boolean;
  as_of: Record<string, string>; stale?: string[]; notices?: string[];
};

// 최신 condition_sets + 예산 + 지역 단지 행을 읽는다. RPC 오류는 throw
export async function loadConditionContext(ctx: ToolContext): Promise<ConditionContext | { error: "region_required" | "conditions_required" }> {
  const { supabase, planId } = ctx;
  const { data: c, error } = await supabase
    .from("condition_sets").select("*").eq("plan_id", planId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!c?.region_codes?.length) return { error: "region_required" };
  const conditions: Conditions = {
    housing_types: c.housing_types, price_min: c.price_min, price_max: c.price_max,
    area_min: c.area_min, area_max: c.area_max, approval_year_min: c.approval_year_min,
    household_count_min: c.household_count_min, parking_per_household_min: c.parking_per_household_min,
    floor_area_ratio_max: c.floor_area_ratio_max, mgmt_fee_per_m2_max: c.mgmt_fee_per_m2_max,
    rooms_min: c.rooms_min, baths_min: c.baths_min, floor_pref: c.floor_pref, direction_pref: c.direction_pref,
    priorities: (c.priorities ?? {}) as Conditions["priorities"],
  };
  const stage3Empty = !conditions.housing_types.length && [conditions.price_min, conditions.price_max,
    conditions.area_min, conditions.area_max, conditions.approval_year_min, conditions.household_count_min,
    conditions.parking_per_household_min, conditions.floor_area_ratio_max].every((v) => v === null);
  if (stage3Empty) return { error: "conditions_required" };

  const [prices, rpc, fresh] = await Promise.all([
    getRegionPrices.run({}, ctx),
    supabase.rpc("complexes_for_conditions", {
      region_codes: c.region_codes, months: MONTHS,
      ...(c.area_min !== null && { area_min: c.area_min }),
      ...(c.area_max !== null && { area_max: c.area_max }),
    }),
    supabase.from("data_freshness").select("as_of").eq("dataset", DATASET).maybeSingle(),
  ]);
  if (rpc.error) throw new Error(rpc.error.message);
  if (fresh.error) throw new Error(fresh.error.message);

  const regionRows = ((prices.data as { regions?: { sigungu_code: string; median_price: number; max_budget?: number }[] }).regions ?? []);
  const budgets: RegionBudget[] = regionRows.map((r) => ({
    sigungu_code: r.sigungu_code, median_price: r.median_price, max_budget: r.max_budget ?? null,
  }));
  const all = (rpc.data ?? []) as ComplexRow[];
  return {
    conditions, conditionSetId: c.id, regionCodes: c.region_codes, budgets,
    rows: all.slice(0, MAX_ROWS), truncated: all.length > MAX_ROWS,
    as_of: { ...prices.as_of, ...(fresh.data?.as_of && { [DATASET]: fresh.data.as_of }) },
    ...(prices.stale?.length && { stale: prices.stale }),
    ...(prices.notices?.length && { notices: prices.notices }),
  };
}
