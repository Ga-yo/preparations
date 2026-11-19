import OpenAI from "openai";
import { beforeEach, expect, test, vi } from "vitest";
import { inputHash } from "@/lib/agent/check";
import { fakeDb } from "@/lib/agent/fake-db";
import { kstToday } from "@/lib/agent/orchestrator";

const PLAN = "11111111-1111-4111-8111-111111111111";
let tables: Record<string, Record<string, unknown>[]>;
let inserts: Record<string, unknown>[];
let used = 1;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const db = fakeDb(tables);
    return {
      from: (t: string) => {
        const q = db.from(t as never) as unknown as Record<string, unknown>;
        q.insert = async (row: Record<string, unknown>) => { inserts.push({ table: t, ...row }); return { error: null }; };
        return q;
      },
      rpc: async () => ({ data: used, error: null }),
      auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    };
  },
}));
const { runCheck } = vi.hoisted(() => ({ runCheck: vi.fn() }));
vi.mock("@/lib/agent/check", async (orig) => ({ ...(await orig<typeof import("@/lib/agent/check")>()), runCheck }));

const { loadAssistant, runAiCheck } = await import("./assistant");

const profile = { plan_id: PLAN, is_first_time: true, updated_at: "t" };
const hashNow = () => inputHash({ profile, cond: null, favoriteIds: [], today: kstToday() });

beforeEach(() => {
  tables = { financial_profiles: [profile], condition_sets: [], candidates: [], ai_checks: [], chat_messages: [] };
  inserts = []; used = 1;
  runCheck.mockReset();
  vi.stubEnv("GEMINI_API_KEY", "test-key");
});

test("점검 결과를 저장하고 돌려준다. 3단계가 아니면 action은 버린다", async () => {
  runCheck.mockResolvedValue({ summary: "요약", questions: ["q"], action: { field: "priority.price_max", value: "prefer", label: "l" }, tools: ["get_budget"] });
  const r = await runAiCheck(PLAN, 1);
  expect(r).toMatchObject({ check: { summary: "요약", action: null, tools: ["get_budget"], fresh: true } });
  expect(inserts).toEqual([expect.objectContaining({ table: "ai_checks", stage: 1, input_hash: hashNow(), action: null })]);
});

test("3단계 우선순위 제안은 허용 키만 남긴다", async () => {
  runCheck.mockResolvedValue({ summary: "s", questions: [], action: { field: "priority.price_max", value: "prefer", label: "l" }, tools: [] });
  expect(await runAiCheck(PLAN, 3)).toMatchObject({ check: { action: { field: "priority.price_max" } } });
  tables.ai_checks = [];
  runCheck.mockResolvedValue({ summary: "s", questions: [], action: { field: "priority.rooms_min", value: "prefer", label: "l" }, tools: [] });
  expect(await runAiCheck(PLAN, 3)).toMatchObject({ check: { action: null } });
});

test("입력이 같으면 Gemini를 부르지 않고 지난 점검을 쓴다", async () => {
  tables.ai_checks = [{ plan_id: PLAN, stage: 1, input_hash: hashNow(), summary: "지난", questions: [], action: null, tools: [], created_at: "2026-11-18" }];
  expect(await runAiCheck(PLAN, 1)).toMatchObject({ check: { summary: "지난", fresh: true } });
  expect(runCheck).not.toHaveBeenCalled();
});

test("앞 단계의 단계별 최신 요약을 넘긴다", async () => {
  tables.ai_checks = [
    { plan_id: PLAN, stage: 1, input_hash: "old", summary: "1단계 옛것", created_at: "2026-11-01" },
    { plan_id: PLAN, stage: 1, input_hash: "old", summary: "1단계 최신", created_at: "2026-11-02" },
    { plan_id: PLAN, stage: 2, input_hash: "old", summary: "2단계", created_at: "2026-11-01" },
    { plan_id: PLAN, stage: 4, input_hash: "old", summary: "뒤 단계", created_at: "2026-11-03" },
  ];
  runCheck.mockResolvedValue({ summary: "s", questions: [], action: null, tools: [] });
  await runAiCheck(PLAN, 3);
  expect(runCheck.mock.calls[0][0].priorSummaries).toEqual([
    { stage: 1, input_hash: "old", summary: "1단계 최신", created_at: "2026-11-02" },
    { stage: 2, input_hash: "old", summary: "2단계", created_at: "2026-11-01", plan_id: PLAN },
  ].map(({ stage, summary }) => expect.objectContaining({ stage, summary })));
});

test("한도 초과·Gemini 429·키 없음", async () => {
  used = 31;
  expect(await runAiCheck(PLAN, 1)).toEqual({ error: "rate_limited" });
  used = 1;
  runCheck.mockRejectedValue(Object.assign(Object.create(OpenAI.APIError.prototype), { status: 429 }));
  expect(await runAiCheck(PLAN, 1)).toEqual({ error: "llm_quota" });
  vi.stubEnv("GEMINI_API_KEY", "");
  expect(await runAiCheck(PLAN, 1)).toEqual({ error: "llm_unavailable" });
  expect(inserts).toHaveLength(0);
});

test("loadAssistant: 점검 전엔 규칙 질문, 채팅 기록은 질문·답 쌍으로", async () => {
  tables.chat_messages = [
    { plan_id: PLAN, id: 1, role: "user", content: "LTV?" }, { plan_id: PLAN, id: 2, role: "assistant", content: "LTV는…" },
    { plan_id: PLAN, id: 3, role: "user", content: "답 없는 질문" },
  ];
  const r = await loadAssistant(PLAN, 1);
  expect(r.check).toBeNull();
  expect(r.suggestions[0]).toBe("생애최초면 취득세 감면을 받을 수 있나요?");
  expect(r.history).toEqual([{ q: "LTV?", a: "LTV는…" }]);
});

test("loadAssistant: 입력이 바뀐 점검은 fresh=false, 질문은 규칙으로", async () => {
  tables.ai_checks = [{ plan_id: PLAN, stage: 1, input_hash: "old", summary: "s", questions: ["AI 질문"], action: null, tools: [], created_at: "x" }];
  const r = await loadAssistant(PLAN, 1);
  expect(r.check?.fresh).toBe(false);
  expect(r.suggestions).not.toContain("AI 질문");
});
