// M7 단계별 AI 점검. 에이전트가 단계 목표를 받아 툴을 스스로 골라 실행하고 브리핑·추천 질문·제안을 낸다.
// 숫자 규칙은 채팅과 같다(SYSTEM_PROMPT: 툴 결과에서만 인용, 원칙 1).
import { createHash } from "node:crypto";
import type OpenAI from "openai";
import { z } from "zod";
import { MAX_STEPS_REPLY, runAgent } from "./orchestrator";
import type { ToolContext } from "./tool";

export const STAGE_GOALS: Record<number, string> = {
  1: "구매 상황과 예산. get_budget으로 예산·대출·월 상환액·부대비용을 확인하고 diagnoses(대출이 묶인 이유, 생애최초·정책대출 등)를 짚으세요.",
  2: "희망 지역과 생활 조건. get_region_prices로 희망 지역(없으면 출퇴근 지역 시·도) 시세와 예산 적합성(affordable)을 확인하세요. 거래가 적은 지역(low_sample)도 짚으세요.",
  3: "주택 조건. check_conditions로 조건 충돌(conflicts)과 예산 대비 최고가를 확인하고, 후보가 적으면 compare_condition_changes나 blocking 조건을 근거로 어떤 조건의 우선순위를 '선호'로 바꾸면 좋은지 제안하세요. 데이터가 없어 거르지 못하는 조건도 알리세요.",
  4: "후보 탐색. search_complexes로 후보 수, 예산 안 후보, 맞지 않는 조건(fit.unmet·missing)을 확인하세요. 후보가 없으면 3단계 조건 조정을 안내하세요.",
  5: "비교와 구매 판단. compare_complexes로 관심 단지의 예산 적합성·위험(risks)·지표별 유리한 단지(best)를 정리하고 계약 전 확인할 점을 get_tip으로 덧붙이세요. 어느 단지를 사라고 정하지 마세요.",
};

const CHECK_PROMPT = `
지금은 사용자가 'AI 점검 받기'를 누른 상황입니다. 질문을 기다리지 말고, 단계 목표에 맞는 툴을 스스로 골라 호출해 사용자가 놓쳤을 법한 점을 먼저 짚으세요.
- 툴 결과에 stale이 있거나 기준일이 오래됐으면 먼저 알리세요.
- 이전 단계 점검 요약이 있으면 이번 단계와 이어지는 점(예: 1단계에서 대출이 묶였으면 3단계 최고가)을 짚으세요.
- 최종 답변은 아래 JSON 하나만, 코드 블록 없이 쓰세요.
{"summary": "브리핑 3~6문장, 평문", "questions": ["사용자가 이어서 물어볼 만한 짧은 질문", "최대 3개"], "action": null}
- 3단계에서만, 툴 결과가 근거일 때 action에 우선순위 변경 제안 하나를 넣을 수 있습니다:
{"field": "priority.<조건키>", "value": "prefer" 또는 "ignore", "label": "버튼 문구(예: 최고가를 선호로 바꿔 보기)"}
조건키: price_max, area, approval_year_min, household_count_min, parking_per_household_min, floor_area_ratio_max, station_distance_max, elementary_distance_max`;

const Action = z.object({
  field: z.string().regex(/^priority\.[a-z_]+$/),
  value: z.enum(["prefer", "ignore"]),
  label: z.string().min(1).max(60),
});
const Reply = z.object({
  summary: z.string().min(1).max(3000),
  questions: z.array(z.string().min(1).max(100)).max(3).catch([]),
  action: Action.nullable().catch(null).optional(),
});
export type CheckAction = z.infer<typeof Action>;
export type CheckResult = { summary: string; questions: string[]; action: CheckAction | null; tools: string[] };

// 모델이 JSON 앞뒤에 말을 붙이거나 코드 블록으로 감싸도 첫 { ~ 마지막 } 을 읽는다. 실패하면 원문을 브리핑으로 쓴다
export function parseCheckReply(text: string): Omit<CheckResult, "tools"> {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s >= 0 && e > s) {
    try {
      const r = Reply.safeParse(JSON.parse(text.slice(s, e + 1)));
      if (r.success) return { summary: r.data.summary.trim(), questions: r.data.questions, action: r.data.action ?? null };
    } catch { /* 아래 원문 처리 */ }
  }
  return { summary: text.trim(), questions: [], action: null };
}

export async function runCheck(p: {
  client: Pick<OpenAI, "chat">; stage: number; ctx: ToolContext; priorSummaries: { stage: number; summary: string }[];
}): Promise<CheckResult> {
  const prior = p.priorSummaries.length
    ? `\n이전 단계 점검 요약:\n${p.priorSummaries.map((s) => `- ${s.stage}단계: ${s.summary}`).join("\n")}`
    : "";
  const out = await runAgent({
    client: p.client, stage: p.stage, ctx: p.ctx, systemExtra: CHECK_PROMPT,
    history: [{ role: "user", content: `[AI 점검] ${p.stage}단계. 목표: ${STAGE_GOALS[p.stage]}${prior}` }],
  });
  if (out.reply === MAX_STEPS_REPLY || !out.reply.trim()) throw new Error("check_incomplete");
  return { ...parseCheckReply(out.reply), tools: [...new Set(out.toolCalls.map((c) => c.name))] };
}

// 같은 입력·같은 날이면 같은 해시 → 지난 점검을 재사용(M7-D9). 시각·id 컬럼은 빼서 내용만 비교
const OMIT = new Set(["id", "created_at", "updated_at", "user_id", "plan_id"]);
const clean = (row: Record<string, unknown> | null) =>
  row && Object.fromEntries(Object.entries(row).filter(([k]) => !OMIT.has(k)).sort(([a], [b]) => a.localeCompare(b)));
export function inputHash(i: {
  profile: Record<string, unknown> | null; cond: Record<string, unknown> | null; favoriteIds: number[]; today: string;
}): string {
  const body = JSON.stringify([clean(i.profile), clean(i.cond), [...i.favoriteIds].sort((a, b) => a - b), i.today]);
  return createHash("sha256").update(body).digest("hex");
}
