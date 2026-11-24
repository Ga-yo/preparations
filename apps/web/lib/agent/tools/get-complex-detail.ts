import { z } from "zod";
import type { ComplexRow } from "@/lib/calc/conditions";
import { activeKeys } from "@/lib/calc/conditions";
import { fitScore, maxBudgetFor, neighborStats } from "@/lib/calc/fit";
import { defaultArea, latestMonthChange, monthKeys, monthlySeries } from "@/lib/calc/area-prices";
import { loadRedevelopment } from "../redevelopment";
import { defineTool, type ToolContext, type ToolResult } from "../tool";
import { loadConditionContext, MONTHS } from "./condition-context";

const DATASETS = ["complexes:building_ledger", "transactions:apartment", "complexes:location", "pois:subway_station", "pois:school"];
const CHART_MONTHS = 12;
// 화면은 면적별 50건, LLM에는 토큰·chat_messages 용량을 아끼려 5건만(trade_total로 전체 건수는 알린다)
export const PAGE_TRADES_PER_AREA = 50;
const LLM_TRADES_PER_AREA = 5;
const round2 = (v: number) => Math.round(v * 100) / 100;

const FEE_DEADLINE_MS = 6000;
// K-apt가 멈춰도 상세 렌더가 막히지 않도록 전체 시한을 둔다
const withDeadline = <T extends { status: string }>(p: Promise<T>) => {
  let t: ReturnType<typeof setTimeout>;
  const timeout = new Promise<{ status: "error" }>((r) => { t = setTimeout(() => r({ status: "error" }), FEE_DEADLINE_MS); });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
};

export const getComplexDetail = defineTool({
  name: "get_complex_detail",
  description:
    "단지 하나의 기본 정보, 전용면적별(areas: 면적 그룹마다 최근 12개월 월 중위가·전월 대비·최근 실거래 최대 5건과 전체 건수 trade_total, default_area는 거래가 가장 많은 면적), 같은 법정동 단지 대비 가격 위치, K-apt 관리비(mgmt_fee, 조건을 저장했고 단지가 사용자 지역에 있을 때만 포함), 정비사업 정보(redevelopment: in_zone/near/none/not_covered/not_loaded)를 돌려준다. 실거래는 저장된 희망 면적 범위 기준이다. fit이 있으면 저장된 조건과의 적합도다.",
  schema: z.object({ complex_id: z.number().int().positive() }),
  run: (args, ctx) => loadComplexDetail(args.complex_id, ctx, LLM_TRADES_PER_AREA),
});

export async function loadComplexDetail(complexId: number, ctx: ToolContext, tradesPerArea: number): Promise<ToolResult> {
  const { supabase } = ctx;
  const { data: c, error } = await supabase.from("complexes")
    .select("id, name, region_code, jibun_address, road_address, kapt_code, approval_date, household_count, building_count, parking_count, site_area_m2, floor_area_ratio, building_coverage_ratio, location")
    .eq("id", complexId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!c) return { data: { error: "complex_not_found" }, as_of: {} };

  const { getMgmtFee } = await import("@/lib/kapt/mgmt-fee"); // server-only: 툴 목록을 import하는 테스트가 깨지지 않게 지연 로드
  const l = await loadConditionContext(ctx);
  const ok = !("error" in l);
  const area_min = ok ? l.conditions.area_min : null;
  const area_max = ok ? l.conditions.area_max : null;
  const area = { ...(area_min !== null && { area_min }), ...(area_max !== null && { area_max }) };

  const own = ok ? l.rows.find((r) => r.complex_id === c.id) : undefined;
  const [trades, monthly, nb, nearby, fresh, mgmt_fee, redev] = await Promise.all([
    supabase.rpc("complex_area_trades", { p_complex_id: c.id, ...area, lim_per_area: tradesPerArea }),
    supabase.rpc("complex_area_monthly_prices", { p_complex_id: c.id, ...area, months: CHART_MONTHS }),
    supabase.rpc("complexes_for_conditions", { region_codes: [c.region_code], ...area, months: MONTHS, ...(ok && l.commuteCode && { commute_code: l.commuteCode }) }),
    supabase.rpc("complex_nearby_pois", { p_complex_id: c.id, radius_m: 1000 }),
    ok ? null : supabase.from("data_freshness").select("dataset, as_of").in("dataset", DATASETS),
    ok && own ? withDeadline(getMgmtFee(c, ctx.today)) : null, // 조건을 저장한 계획의 자기 지역 단지에서만 K-apt를 부른다(호출 남용 방지). 실패해도 throw하지 않는다
    loadRedevelopment(supabase, [{ id: c.id, region_code: c.region_code }]),
  ]);
  const redevelopment = redev.byId[c.id];
  for (const r of [trades, monthly, nb, nearby]) if (r.error) throw new Error(r.error.message);
  if (fresh?.error) throw new Error(fresh.error.message);

  const ownRow = own ?? ((nb.data ?? []) as ComplexRow[]).find((r) => r.complex_id === c.id); // 사용자 지역 밖 단지는 같은 동 행으로 보충
  const fit = ok && own ? fitScore(l.conditions, own, maxBudgetFor(l.budgets, own), activeKeys(l.conditions, l.rows)) : null;
  const near = { nearest_station_name: ownRow?.nearest_station_name ?? null, nearest_station_m: ownRow?.nearest_station_m ?? null, nearest_elementary_m: ownRow?.nearest_elementary_m ?? null,
    nearest_park_m: ownRow?.nearest_park_m ?? null, shop_count_500m: ownRow?.shop_count_500m ?? null, commute_m: ownRow?.commute_m ?? null };
  const nearbyRows = nearby.data ?? [];
  const keys = monthKeys(ctx.today, CHART_MONTHS);
  // 최근 12개 달력월에 거래가 있는 면적만 탭으로 둔다(오래된 거래만 있는 면적은 빈 차트가 된다)
  const groups = [...new Set((monthly.data ?? []).filter((m) => keys.includes(m.month)).map((m) => m.area))].sort((a, b) => a - b);
  const areas = groups.map((g) => {
    const series = monthlySeries((monthly.data ?? []).filter((m) => m.area === g), keys);
    const rows = (trades.data ?? []).filter((t) => t.area === g);
    return {
      area: g, label: `${g}㎡`, monthly: series, latest: latestMonthChange(series),
      trades: rows.map(({ deal_date, deal_amount, exclusive_area, floor }) => ({ deal_date, deal_amount, exclusive_area, floor })),
      trade_total: rows[0]?.area_total ?? 0,
    };
  });
  const default_area = defaultArea(areas.map((a) => ({ area: a.area, deal_count: a.monthly.reduce((s, m) => s + m.deal_count, 0) })));
  const as_of = {
    ...(ok ? l.as_of : Object.fromEntries((fresh?.data ?? []).map((f) => [f.dataset, f.as_of]))),
    ...(mgmt_fee?.status === "ok" && { mgmt_fee: mgmt_fee.month }),
    ...redev.as_of,
  };

  return {
    data: {
      complex: {
        id: c.id, name: c.name, region_code: c.region_code, jibun_address: c.jibun_address, road_address: c.road_address,
        approval_year: c.approval_date ? Number(c.approval_date.slice(0, 4)) : ownRow?.approval_year ?? null,
        household_count: c.household_count, building_count: c.building_count,
        parking_per_household: c.parking_count !== null && c.household_count ? round2(c.parking_count / c.household_count) : null,
        floor_area_ratio: c.floor_area_ratio, building_coverage_ratio: c.building_coverage_ratio,
        land_share_m2: c.site_area_m2 !== null && c.household_count ? round2(c.site_area_m2 / c.household_count) : null,
        median_price: ownRow?.median_price ?? null, deal_count: ownRow?.deal_count ?? 0,
        ...near,
      },
      fit, redevelopment, ...(mgmt_fee && { mgmt_fee }), nearby: nearbyRows, areas, default_area,
      neighbors: { ...neighborStats(c.id, (nb.data ?? []) as ComplexRow[]), basis: "same_dong" },
      criteria: { area_min, area_max, chart_months: CHART_MONTHS },
    },
    as_of,
    ...(ok && l.stale && { stale: l.stale }),
    notices: [...(c.location !== null ? [] : ["no_location_data"]), ...(redevelopment.status === "not_covered" ? ["redevelopment_not_covered"] : []), "land_share_is_average", ...(areas.length ? [] : ["no_recent_trades"])],
  };
}
