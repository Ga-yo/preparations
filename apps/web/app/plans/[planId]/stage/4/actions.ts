import { z } from "zod";
import { kstToday } from "@/lib/agent/orchestrator";
import type { ToolResult } from "@/lib/agent/tool";
import { getComplexDetail } from "@/lib/agent/tools/get-complex-detail";
import { loadConditionContext } from "@/lib/agent/tools/condition-context";
import { searchComplexes } from "@/lib/agent/tools/search-complexes";
import { fitScore, maxBudgetFor } from "@/lib/calc/fit";

type Result = { ok: true } | { ok: false; error: "invalid" | "not_found" | "conditions_required" };

async function client() {
  const { createClient } = await import("@/lib/supabase/server"); // server-only: 테스트가 import할 수 있게 지연 로드
  return createClient();
}
const ctxOf = async (planId: string) => ({ supabase: await client(), planId, today: kstToday() });

export async function setFavorite(planId: string, complexId: number, favorite: boolean): Promise<Result> {
  if (!z.uuid().safeParse(planId).success || !z.number().int().positive().safeParse(complexId).success) {
    return { ok: false, error: "invalid" };
  }
  const ctx = await ctxOf(planId);
  const { supabase } = ctx;
  if (!favorite) {
    const { data: sets, error: setErr } = await supabase.from("condition_sets").select("id").eq("plan_id", planId);
    if (setErr) throw new Error(setErr.message);
    const { error } = await supabase.from("candidates").update({ is_favorite: false })
      .eq("complex_id", complexId).in("condition_set_id", (sets ?? []).map((s) => s.id));
    if (error) throw new Error(error.message);
    return { ok: true };
  }
  const l = await loadConditionContext(ctx);
  if ("error" in l) {
    // 조건이 없는 것과 남의 계획(RLS로 안 보임)을 구분한다
    const { data: plan, error } = await supabase.from("plans").select("id").eq("id", planId).maybeSingle();
    if (error) throw new Error(error.message);
    return { ok: false, error: plan ? "conditions_required" : "not_found" };
  }
  const x = l.rows.find((r) => r.complex_id === complexId);
  const fit = x ? fitScore(l.conditions, x, maxBudgetFor(l.budgets, x)) : null;
  const { error } = await supabase.from("candidates").upsert({
    condition_set_id: l.conditionSetId, complex_id: complexId, is_favorite: true,
    fit_score: fit?.score ?? null, pros: fit?.met ?? [], cons: fit?.unmet ?? [],
  }, { onConflict: "condition_set_id,complex_id" });
  if (error && ["23503", "42501"].includes(error.code)) return { ok: false, error: "not_found" };
  if (error) throw new Error(error.message);
  const { error: stageError } = await supabase.from("plans").update({ current_stage: 4 }).eq("id", planId).lt("current_stage", 4);
  if (stageError) throw new Error(stageError.message);
  return { ok: true };
}

export async function favoriteComplexIds(planId: string): Promise<number[]> {
  const supabase = await client();
  const { data, error } = await supabase.from("candidates").select("complex_id, condition_sets!inner(plan_id)")
    .eq("condition_sets.plan_id", planId).eq("is_favorite", true);
  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((r) => r.complex_id))];
}

export async function searchForPlan(planId: string): Promise<ToolResult> {
  return searchComplexes.run({}, await ctxOf(planId));
}

export async function detailForPlan(planId: string, complexId: number): Promise<ToolResult> {
  return getComplexDetail.run({ complex_id: complexId }, await ctxOf(planId));
}
