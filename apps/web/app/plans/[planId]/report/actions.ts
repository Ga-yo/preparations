import type { Json } from "@repo/db-types";
import OpenAI from "openai";
import { z } from "zod";
import { DAILY_CHAT_LIMIT } from "@/app/api/chat/route";
import { kstToday, LLM_BASE_URL } from "@/lib/agent/orchestrator";
import { assembleReport, conditionsSummary, type ReportPayload } from "@/lib/report/assemble";
import { writeNarrative } from "@/lib/report/narrative";
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
      .select("region_codes, region_reason, commute_region_code, area_min, area_max, price_max, redevelopment_interest")
      .eq("plan_id", planId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("tips").select("field_key, title, body, caution").eq("stage", 5).in("field_key", ["checklist", "next_steps"]).order("sort_order"),
  ]);
  for (const r of [cond, tips]) if (r.error) throw new Error(r.error.message);
  const ids = parseIds(undefined, favorites.map((f) => f.complex_id));
  const codes = cond.data ? [...cond.data.region_codes, ...(cond.data.commute_region_code ? [cond.data.commute_region_code] : [])] : [];
  const [compare, names] = await Promise.all([
    ids.length >= 2 ? compareForPlan(planId, ids) : null,
    codes.length ? supabase.from("regions").select("code, full_name").in("code", codes) : null,
  ]);
  if (names?.error) throw new Error(names.error.message);

  const payload: ReportPayload = assembleReport({
    generated_on: kstToday(), budget, favorites, compare,
    conditions: conditionsSummary(cond.data, Object.fromEntries((names?.data ?? []).map((r) => [r.code, r.full_name]))),
    checklist: tips.data ?? [],
  });
  const { error } = await supabase.from("reports").insert({ plan_id: planId, user_id: user.id, payload: payload as unknown as { [key: string]: Json } });
  if (error) throw new Error(error.message);
}

export type NarrativeError = "no_report" | "rate_limited" | "llm_quota" | "llm_unavailable" | "narrative_has_numbers";

// 최신 리포트의 AI 해설(narrative)만 채운다. 리포트 생성과 분리해 Gemini 한도 초과가 리포트를 막지 않게 한다
export async function generateNarrative(planId: string): Promise<NarrativeError | null> {
  z.uuid().parse(planId);
  // 키가 비면 openai SDK가 OPENAI_API_KEY로 폴백하므로 먼저 막는다(/api/chat과 동일)
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { console.error("GEMINI_API_KEY is not configured"); return "llm_unavailable"; }
  const supabase = await client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");

  const { data: report, error } = await supabase.from("reports").select("id, payload")
    .eq("plan_id", planId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!report) return "no_report";

  // 채팅과 같은 하루 한도를 나눠 쓴다(무료 요금제 한도는 프로젝트 공유)
  const { data: used, error: usageErr } = await supabase.rpc("bump_chat_usage");
  if (usageErr) throw new Error(usageErr.message);
  if (used > DAILY_CHAT_LIMIT) return "rate_limited";

  let narrative: string;
  try {
    narrative = await writeNarrative(new OpenAI({ apiKey, baseURL: LLM_BASE_URL }), report.payload as unknown as ReportPayload);
  } catch (e) {
    if (e instanceof OpenAI.APIError && e.status === 429) { console.error("llm quota exceeded"); return "llm_quota"; }
    if (e instanceof Error && e.message === "narrative_has_numbers") return "narrative_has_numbers";
    console.error("narrative failed", e);
    return "llm_unavailable";
  }
  const upd = await supabase.from("reports").update({ narrative }).eq("id", report.id);
  if (upd.error) throw new Error(upd.error.message);
  return null;
}
