import { z } from "zod";
import { findConflicts, type ComplexRow, type Conditions, type RegionBudget } from "@/lib/calc/conditions";
import { defineTool, type ToolContext, type ToolResult } from "../tool";
import { getRegionPrices } from "./get-region-prices";

const DATASET = "complexes:building_ledger";
const MONTHS = 12;
const MAX_ROWS = 3000; // RPC는 잘림을 알리려고 한 행 더 준다

export const checkConditions = defineTool({
  name: "check_conditions",
  description:
    "3단계에 저장한 주택 조건을 예산·지역 시세·건축물대장 단지 데이터와 대조해 충돌(conflicts), 조건별 단지 수(counts), 필수 조건을 만족하는 단지(matches)를 돌려준다. 숫자는 이 결과만 인용한다.",
  schema: z.object({}),
  async run(_args, ctx: ToolContext): Promise<ToolResult> {
    const { supabase, planId } = ctx;
    const { data: c, error } = await supabase
      .from("condition_sets").select("*").eq("plan_id", planId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    if (!c?.region_codes?.length) return { data: { error: "region_required" }, as_of: {} };
    const conditions: Conditions = {
      housing_types: c.housing_types, price_min: c.price_min, price_max: c.price_max,
      area_min: c.area_min, area_max: c.area_max, approval_year_min: c.approval_year_min,
      household_count_min: c.household_count_min, parking_per_household_min: c.parking_per_household_min,
      floor_area_ratio_max: c.floor_area_ratio_max, mgmt_fee_per_m2_max: c.mgmt_fee_per_m2_max,
      rooms_min: c.rooms_min, baths_min: c.baths_min, floor_pref: c.floor_pref, direction_pref: c.direction_pref,
      priorities: (c.priorities ?? {}) as Conditions["priorities"],
    };
    const stage3Empty = !conditions.housing_types.length && [conditions.price_min, conditions.price_max,
      conditions.approval_year_min, conditions.household_count_min, conditions.parking_per_household_min,
      conditions.floor_area_ratio_max].every((v) => v === null);
    if (stage3Empty) return { data: { error: "conditions_required" }, as_of: {} };

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
    const rows = (rpc.data ?? []) as ComplexRow[];
    const result = findConflicts(conditions, budgets, rows.slice(0, MAX_ROWS), rows.length > MAX_ROWS);

    const as_of = { ...prices.as_of, ...(fresh.data?.as_of && { [DATASET]: fresh.data.as_of }) };
    return {
      data: { ...result, criteria: { months: MONTHS } },
      as_of,
      ...(prices.stale?.length && { stale: prices.stale }),
      ...(prices.notices?.length && { notices: prices.notices }),
    };
  },
});
