import type { Json } from "@repo/db-types";
import { z } from "zod";
import { kstToday } from "@/lib/agent/orchestrator";
import { budgetsByRegion } from "@/lib/agent/tools/get-budget";
import { assembleReport, conditionsSummary, pickChecklist, type ReportPayload } from "@/lib/report/assemble";
import { freshCheckSummary } from "../_components/assistant";
import { getBudgetForPlan } from "../stage/1/actions";
import { favoriteComplexIds } from "../stage/4/actions";
import { compareForPlan, parseIds } from "../stage/5/actions";

async function client() {
  const { createClient } = await import("@/lib/supabase/server"); // server-only: 테스트가 import할 수 있게 지연 로드
  return createClient();
}

// 리포트는 버튼을 눌렀을 때만 만든다(GET 렌더에서 쓰지 않음). 숫자는 툴 결과 스냅숏 그대로 (M6-D6)
export async function createReport(planId: string): Promise<void> {
  z.uuid().parse(planId);
  const supabase = await client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");

  const [budget, favorites, cond, tips] = await Promise.all([
    getBudgetForPlan(planId),
    favoriteComplexIds(planId),
    supabase.from("condition_sets")
      .select("region_codes, region_reason, commute_region_code, commute_station, area_min, area_max, price_max, redevelopment_interest")
      .eq("plan_id", planId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("tips").select("field_key, title, body, caution").eq("stage", 5).in("field_key", ["checklist", "next_steps", "redevelopment"]).order("sort_order"),
  ]);
  for (const r of [cond, tips]) if (r.error) throw new Error(r.error.message);
  const ids = parseIds(undefined, favorites.map((f) => f.complex_id));
  const codes = cond.data ? [...cond.data.region_codes, ...(cond.data.commute_region_code ? [cond.data.commute_region_code] : [])] : [];
  const [compare, names, narrative, groups] = await Promise.all([
    ids.length >= 2 ? compareForPlan(planId, ids) : null,
    codes.length ? supabase.from("regions").select("code, full_name").in("code", codes) : null,
    freshCheckSummary(supabase, planId, 5), // 5단계 AI 점검 = 리포트 AI 해설(M7-D7)
    // 지역을 저장했으면 "지역 미지정" 예산 대신 희망 지역 기준 예산을 쓴다(2단계 시세 표와 같은 면적 기준)
    cond.data?.region_codes.length ? budgetsByRegion(supabase, planId, kstToday(), cond.data.region_codes, cond.data.area_max) : null,
  ]);
  if (names?.error) throw new Error(names.error.message);
  const nameOf = Object.fromEntries((names?.data ?? []).map((r) => [r.code, r.full_name]));

  const payload: ReportPayload = assembleReport({
    generated_on: kstToday(), budget: groups?.[0]?.budget ?? budget, favorites, compare,
    conditions: conditionsSummary(cond.data, nameOf),
    ...(groups?.length && { region_budgets: groups.map((g) => ({ region_names: g.region_codes.map((c) => nameOf[c] ?? c), budget: g.budget })) }),
    checklist: pickChecklist(tips.data ?? [], compare),
  });
  const { error } = await supabase.from("reports").insert({ plan_id: planId, user_id: user.id, payload: payload as unknown as { [key: string]: Json }, narrative });
  if (error) throw new Error(error.message);
}

