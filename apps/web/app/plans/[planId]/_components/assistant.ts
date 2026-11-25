// M7 AI 점검·추천 질문·채팅 기록을 읽고 쓰는 서버 함수. 페이지의 인라인 "use server"에서 부른다(기존 actions.ts와 같은 방식)
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@repo/db-types";
import OpenAI from "openai";
import { z } from "zod";
import { DAILY_CHAT_LIMIT } from "@/app/api/chat/route";
import { inputHash, runCheck, type CheckAction } from "@/lib/agent/check";
import { kstToday, LLM_BASE_URL } from "@/lib/agent/orchestrator";
import { ruleQuestions } from "@/lib/agent/suggestions";
import { pickTips, tipSituation, type TipPick } from "@/lib/agent/tip-picks";
import { PRIORITY_KEYS } from "../stage/3/actions";

type Db = SupabaseClient<Database>;
export type AiCheck = { summary: string; questions: string[]; action: CheckAction | null; tools: string[]; created_at: string; fresh: boolean };
export type CheckError = "rate_limited" | "llm_quota" | "llm_unavailable";
export type ChatTurn = { q: string; a: string };

const HISTORY_LIMIT = 20;
const Stage = z.number().int().min(1).max(5);

async function client() {
  const { createClient } = await import("@/lib/supabase/server"); // server-only: 테스트가 import할 수 있게 지연 로드
  return createClient();
}

// 점검 캐시·추천 질문의 기준이 되는 현재 입력. 관심 단지는 favoriteComplexIds와 같은 조인
async function planInputs(supabase: Db, planId: string) {
  const [profile, cond, favs] = await Promise.all([
    supabase.from("financial_profiles").select("*").eq("plan_id", planId).maybeSingle(),
    supabase.from("condition_sets").select("*").eq("plan_id", planId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("candidates").select("complex_id, condition_sets!inner(plan_id)").eq("condition_sets.plan_id", planId).eq("is_favorite", true),
  ]);
  for (const r of [profile, cond, favs]) if (r.error) throw new Error(r.error.message);
  const favoriteIds = [...new Set((favs.data ?? []).map((r) => r.complex_id))];
  const today = kstToday();
  return {
    profile: profile.data, cond: cond.data, favoriteIds, today,
    hash: inputHash({ profile: profile.data, cond: cond.data, favoriteIds, today }),
  };
}

type CheckRow = Database["public"]["Tables"]["ai_checks"]["Row"];
const toCheck = (r: CheckRow, hash: string): AiCheck => ({
  summary: r.summary, questions: r.questions, action: r.action as CheckAction | null, tools: r.tools,
  created_at: r.created_at, fresh: r.input_hash === hash,
});

async function latestCheck(supabase: Db, planId: string, stage: number) {
  const { data, error } = await supabase.from("ai_checks").select("*")
    .eq("plan_id", planId).eq("stage", stage).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// 리포트(M7-D7): 지금 입력과 같은 입력으로 만든 5단계 점검 요약만 해설로 쓴다
export async function freshCheckSummary(supabase: Db, planId: string, stage: number): Promise<string | null> {
  const [inputs, row] = await Promise.all([planInputs(supabase, planId), latestCheck(supabase, planId, stage)]);
  return row && row.input_hash === inputs.hash ? row.summary : null;
}

// 단계 페이지를 열 때 AI가 보여 줄 TIP을 고른다. null이면 화면은 TIP을 모두 보여 준다.
// 입력이 같으면 저장해 둔 결과를 쓰고(날짜는 해시에서 뺀다), 새로 부를 때만 채팅과 같은 하루 한도를 쓴다
export async function stageTipPicks(planId: string, stage: number): Promise<TipPick[] | null> {
  z.uuid().parse(planId); Stage.parse(stage);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const supabase = await client();
  const [inputs, cached, options] = await Promise.all([
    planInputs(supabase, planId),
    supabase.from("tip_picks").select("input_hash, tips").eq("plan_id", planId).eq("stage", stage).maybeSingle(),
    supabase.from("tips").select("slug, title").eq("stage", stage).not("field_key", "is", null).order("sort_order"),
  ]);
  for (const r of [cached, options]) if (r.error) throw new Error(r.error.message);
  if (!inputs.profile && !inputs.cond) return null; // 아직 입력이 없으면 고를 근거가 없다
  const hash = inputHash({ profile: inputs.profile, cond: inputs.cond, favoriteIds: inputs.favoriteIds, today: "" });
  const orNull = (t: TipPick[]) => (t.length ? t : null);
  if (cached.data?.input_hash === hash) return orNull(cached.data.tips as TipPick[]);

  const { data: used, error: usageErr } = await supabase.rpc("bump_chat_usage");
  if (usageErr) throw new Error(usageErr.message);
  if (used > DAILY_CHAT_LIMIT) return null;
  let tips: TipPick[];
  try {
    tips = await pickTips({
      client: new OpenAI({ apiKey, baseURL: LLM_BASE_URL, timeout: 15_000, maxRetries: 0 }),
      stage, options: options.data ?? [], situation: tipSituation([inputs.profile, inputs.cond]),
    });
  } catch (e) {
    console.error("tip picks llm failed", e instanceof OpenAI.APIError ? e.status : e);
    return null;
  }
  const { error } = await supabase.from("tip_picks").upsert({ plan_id: planId, stage, input_hash: hash, tips: tips as Json });
  if (error) throw new Error(error.message);
  return orNull(tips);
}

export async function loadAssistant(planId: string, stage: number): Promise<{ check: AiCheck | null; suggestions: string[]; history: ChatTurn[] }> {
  z.uuid().parse(planId); Stage.parse(stage);
  const supabase = await client();
  const [inputs, row, chat] = await Promise.all([
    planInputs(supabase, planId),
    latestCheck(supabase, planId, stage),
    supabase.from("chat_messages").select("role, content").eq("plan_id", planId)
      .in("role", ["user", "assistant"]).order("id", { ascending: false }).limit(HISTORY_LIMIT),
  ]);
  if (chat.error) throw new Error(chat.error.message);
  const check = row && toCheck(row, inputs.hash);
  const rules = ruleQuestions(stage, { profile: inputs.profile, cond: inputs.cond, favoriteCount: inputs.favoriteIds.length });
  // 새로고침해도 대화가 남게(M7-D8): user 다음 assistant를 한 쌍으로
  const history: ChatTurn[] = [];
  for (const m of (chat.data ?? []).reverse()) {
    if (m.role === "user") history.push({ q: m.content ?? "", a: "" });
    else if (history.length && !history[history.length - 1].a) history[history.length - 1].a = m.content ?? "";
  }
  return { check, suggestions: check?.fresh && check.questions.length ? check.questions : rules, history: history.filter((t) => t.a) };
}

export async function runAiCheck(planId: string, stage: number): Promise<{ check: AiCheck } | { error: CheckError }> {
  z.uuid().parse(planId); Stage.parse(stage);
  // 키가 비면 openai SDK가 OPENAI_API_KEY로 폴백하므로 먼저 막는다(/api/chat과 동일)
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { console.error("GEMINI_API_KEY is not configured"); return { error: "llm_unavailable" }; }
  const supabase = await client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");

  const inputs = await planInputs(supabase, planId);
  const cached = await latestCheck(supabase, planId, stage);
  if (cached?.input_hash === inputs.hash) return { check: toCheck(cached, inputs.hash) }; // 입력이 같으면 다시 부르지 않는다

  // 채팅과 같은 하루 한도를 나눠 쓴다(무료 요금제 한도는 프로젝트 공유)
  const { data: used, error: usageErr } = await supabase.rpc("bump_chat_usage");
  if (usageErr) throw new Error(usageErr.message);
  if (used > DAILY_CHAT_LIMIT) return { error: "rate_limited" };

  const prior = await supabase.from("ai_checks").select("stage, summary")
    .eq("plan_id", planId).lt("stage", stage).order("created_at", { ascending: false }).limit(20);
  if (prior.error) throw new Error(prior.error.message);
  const priorSummaries = [...new Map([...(prior.data ?? [])].reverse().map((r) => [r.stage, r])).values()].sort((a, b) => a.stage - b.stage);

  let r;
  try {
    r = await runCheck({ client: new OpenAI({ apiKey, baseURL: LLM_BASE_URL }), stage, ctx: { supabase, planId, today: inputs.today }, priorSummaries });
  } catch (e) {
    if (e instanceof OpenAI.APIError && e.status === 429) { console.error("llm quota exceeded"); return { error: "llm_quota" }; }
    console.error("ai check failed", e);
    return { error: "llm_unavailable" };
  }
  // 제안은 3단계 우선순위만(M7-D5). 모델이 다른 키를 내면 버린다
  const key = r.action?.field.slice("priority.".length);
  const action = stage === 3 && key && (PRIORITY_KEYS as string[]).includes(key) ? r.action : null;
  const row = { plan_id: planId, user_id: user.id, stage, input_hash: inputs.hash, summary: r.summary, questions: r.questions, action: action as Json, tools: r.tools };
  const { error } = await supabase.from("ai_checks").insert(row);
  if (error) throw new Error(error.message);
  return { check: { ...r, action, created_at: new Date().toISOString(), fresh: true } };
}
