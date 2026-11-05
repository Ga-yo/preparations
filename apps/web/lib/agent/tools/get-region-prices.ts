import { z } from "zod";
import { computeBudget } from "@/lib/calc/budget";
import { resolveRegion } from "../region";
import { defineTool, type ToolContext, type ToolResult } from "../tool";
import { budgetInput, day, loadBudgetData, STALE_DAYS } from "./get-budget";

const DATASET = "transactions:apartment";
const DEFAULT_AREA_M2 = 84;
const LOW_SAMPLE = 5;

export const getRegionPrices = defineTool({
  name: "get_region_prices",
  description:
    "수도권 아파트 매매 실거래가(해제·직거래 제외)의 시군구별 중위가·거래 건수와, 그 지역 규제를 반영한 내 예산으로 접근 가능한지(affordable)를 돌려준다. 숫자는 이 결과만 인용한다.",
  schema: z.object({
    region_name: z.string().max(50).optional().describe("시·도 또는 시군구 이름. 생략하면 2단계에 저장한 희망 지역"),
    area_min: z.number().positive().max(300).optional().describe("전용면적 하한(㎡). 생략하면 2단계에 저장한 희망 면적"),
    area_max: z.number().positive().max(300).optional().describe("전용면적 상한(㎡). 생략하면 2단계에 저장한 희망 면적"),
    months: z.number().int().min(1).max(24).default(12).describe("최근 몇 개월 거래"),
  }),
  async run(args, ctx: ToolContext): Promise<ToolResult> {
    const { supabase, planId, today } = ctx;
    const months = args.months ?? 12;
    // 2단계에 저장한 희망 지역·면적은 인자가 없을 때의 기본값
    const { data: saved, error: savedError } = await supabase
      .from("condition_sets").select("region_codes, area_min, area_max").eq("plan_id", planId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (savedError) throw new Error(savedError.message);
    const areaMin = args.area_min ?? saved?.area_min ?? undefined;
    const areaMax = args.area_max ?? saved?.area_max ?? undefined;
    if (areaMin !== undefined && areaMax !== undefined && areaMin > areaMax) {
      return { data: { error: "area_range_invalid" }, as_of: {} };
    }

    let prefixes: string[];
    if (args.region_name) {
      const r = await resolveRegion(supabase, args.region_name);
      if (r.status === "ambiguous") return { data: { error: "region_ambiguous", candidates: r.candidates }, as_of: {} };
      if (r.status === "not_found") return { data: { error: "region_not_found" }, as_of: {} };
      prefixes = [r.code.endsWith("00000000") ? r.code.slice(0, 2) : r.code.slice(0, 5)];
    } else {
      prefixes = [...new Set((saved?.region_codes ?? []).map((c) => c.slice(0, 5)))];
      if (!prefixes.length) return { data: { error: "region_required" }, as_of: {} };
    }

    const stats = [];
    for (const sigungu_prefix of prefixes) {
      const { data, error } = await supabase.rpc("region_price_stats", {
        sigungu_prefix, housing_type: "apartment", months,
        ...(areaMin !== undefined && { area_min: areaMin }),
        ...(areaMax !== undefined && { area_max: areaMax }),
      });
      if (error) throw new Error(error.message);
      stats.push(...(data ?? []));
    }

    const [budget, fresh] = await Promise.all([
      loadBudgetData(supabase, planId, today),
      supabase.from("data_freshness").select("as_of").eq("dataset", DATASET).maybeSingle(),
    ]);
    if (fresh.error) throw new Error(fresh.error.message);

    const rows = stats.map((s) => {
      const row = {
        sigungu_code: s.sigungu_code, name: s.sigungu_name, median_price: s.median_price,
        deal_count: s.deal_count, latest_deal_date: s.latest_deal_date, low_sample: s.deal_count < LOW_SAMPLE,
      };
      if (!budget) return row;
      // 규제지역 여부가 시군구마다 달라 예산을 지역별로 따로 계산한다
      const max_budget = computeBudget(budgetInput(budget, today, `${s.sigungu_code}00000`, areaMax ?? DEFAULT_AREA_M2)).maxPrice;
      return { ...row, max_budget, affordable: s.median_price <= max_budget };
    });

    const as_of: Record<string, string> = { ...budget?.as_of };
    const stale = [...(budget?.stale ?? [])];
    const txAsOf = fresh.data?.as_of;
    if (txAsOf) {
      as_of[DATASET] = txAsOf;
      if (day(today) - day(txAsOf) > STALE_DAYS * 86_400_000) stale.push(DATASET);
    }
    const notices = [...(budget?.notices ?? []), ...(budget ? [] : ["profile_missing"]), ...(rows.length ? [] : ["no_transactions"])];

    return {
      data: { regions: rows, criteria: { months, area_min: areaMin ?? null, area_max: areaMax ?? null } },
      as_of,
      ...(stale.length && { stale }),
      ...(notices.length && { notices }),
    };
  },
});
