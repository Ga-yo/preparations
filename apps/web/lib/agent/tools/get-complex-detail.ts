import { z } from "zod";
import type { ComplexRow } from "@/lib/calc/conditions";
import { fitScore, maxBudgetFor, neighborStats } from "@/lib/calc/fit";
import { defineTool, type ToolContext, type ToolResult } from "../tool";
import { loadConditionContext, MONTHS } from "./condition-context";

const DATASETS = ["complexes:building_ledger", "transactions:apartment"];
const DETAIL_MONTHS = 24;
const TRADE_LIMIT = 20;
const round2 = (v: number) => Math.round(v * 100) / 100;

export const getComplexDetail = defineTool({
  name: "get_complex_detail",
  description:
    "단지 하나의 기본 정보, 최근 실거래 사례, 월별 중위가, 같은 법정동 단지 대비 가격 위치를 돌려준다. 실거래는 저장된 희망 면적 범위 기준이다. fit이 있으면 저장된 조건과의 적합도다.",
  schema: z.object({ complex_id: z.number().int().positive() }),
  async run(args, ctx: ToolContext): Promise<ToolResult> {
    const { supabase } = ctx;
    const { data: c, error } = await supabase.from("complexes")
      .select("id, name, region_code, jibun_address, road_address, approval_date, household_count, building_count, parking_count, site_area_m2, floor_area_ratio, building_coverage_ratio")
      .eq("id", args.complex_id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!c) return { data: { error: "complex_not_found" }, as_of: {} };

    const l = await loadConditionContext(ctx);
    const ok = !("error" in l);
    const area_min = ok ? l.conditions.area_min : null;
    const area_max = ok ? l.conditions.area_max : null;
    const area = { ...(area_min !== null && { area_min }), ...(area_max !== null && { area_max }) };

    const [trades, monthly, nb, fresh] = await Promise.all([
      supabase.rpc("complex_trades", { p_complex_id: c.id, ...area, lim: TRADE_LIMIT }),
      supabase.rpc("complex_monthly_prices", { p_complex_id: c.id, ...area, months: DETAIL_MONTHS }),
      supabase.rpc("complexes_for_conditions", { region_codes: [c.region_code], ...area, months: MONTHS }),
      ok ? null : supabase.from("data_freshness").select("dataset, as_of").in("dataset", DATASETS),
    ]);
    for (const r of [trades, monthly, nb]) if (r.error) throw new Error(r.error.message);
    if (fresh?.error) throw new Error(fresh.error.message);

    const own = ok ? l.rows.find((r) => r.complex_id === c.id) : undefined;
    const ownRow = own ?? ((nb.data ?? []) as ComplexRow[]).find((r) => r.complex_id === c.id); // 사용자 지역 밖 단지는 같은 동 행으로 보충
    const fit = ok && own ? fitScore(l.conditions, own, maxBudgetFor(l.budgets, own)) : null;
    const tradeRows = trades.data ?? [];
    const as_of = ok ? l.as_of : Object.fromEntries((fresh?.data ?? []).map((f) => [f.dataset, f.as_of]));

    return {
      data: {
        complex: {
          id: c.id, name: c.name, region_code: c.region_code, jibun_address: c.jibun_address, road_address: c.road_address,
          approval_year: c.approval_date ? Number(c.approval_date.slice(0, 4)) : ownRow?.approval_year ?? null,
          household_count: c.household_count, building_count: c.building_count,
          parking_per_household: c.parking_count !== null && c.household_count ? round2(c.parking_count / c.household_count) : null,
          floor_area_ratio: c.floor_area_ratio, building_coverage_ratio: c.building_coverage_ratio,
          land_share_m2: c.site_area_m2 !== null && c.household_count ? round2(c.site_area_m2 / c.household_count) : null,
        },
        fit, trades: tradeRows, monthly: monthly.data ?? [],
        neighbors: { ...neighborStats(c.id, (nb.data ?? []) as ComplexRow[]), basis: "same_dong" },
        criteria: { area_min, area_max, months: DETAIL_MONTHS },
      },
      as_of,
      ...(ok && l.stale && { stale: l.stale }),
      notices: ["no_location_data", "no_redevelopment_data", "land_share_is_average", ...(tradeRows.length ? [] : ["no_recent_trades"])],
    };
  },
});
