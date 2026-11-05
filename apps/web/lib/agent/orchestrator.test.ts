import { expect, test } from "vitest";
import type OpenAI from "openai";
import { fakeDb } from "./fake-db";
import { kstToday, modelForStage, runAgent } from "./orchestrator";
import { SYSTEM_PROMPT } from "./prompt";

type Msg = { content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] };

function fakeClient(replies: (Msg | Error)[]) {
  const calls: unknown[] = [];
  let i = 0;
  const client = {
    chat: {
      completions: {
        create: async (params: unknown) => {
          calls.push(JSON.parse(JSON.stringify(params)));
          const r = replies[Math.min(i++, replies.length - 1)];
          if (r instanceof Error) throw r;
          return { choices: [{ message: { role: "assistant", ...r } }] };
        },
      },
    },
  } as unknown as Pick<OpenAI, "chat">;
  return { client, calls };
}
const toolCall = (name: string, args = "{}"): Msg => ({
  content: null,
  tool_calls: [{ id: "c1", type: "function", function: { name, arguments: args } }],
});
const ctx = (tables: Record<string, Record<string, unknown>[]> = {}) => ({
  planId: "p1", today: "2026-11-04", supabase: fakeDb(tables),
});
const base = { stage: 1, history: [{ role: "user" as const, content: "내 예산 알려줘" }] };

test("툴 호출 후 최종 답변", async () => {
  const { client, calls } = fakeClient([toolCall("get_budget"), { content: "예산은 이렇습니다" }]);
  const r = await runAgent({ client, ...base, ctx: ctx({ financial_profiles: [] }) });
  expect(r.reply).toBe("예산은 이렇습니다");
  expect(r.toolCalls).toHaveLength(1);
  expect(r.toolCalls[0].name).toBe("get_budget");
  expect((calls[0] as { model: string }).model).toBe("deepseek-v4-flash");
});

test("툴이 던져도 루프는 tool_failed로 계속된다", async () => {
  const boom = { from: () => { throw new Error("secret stack"); } } as never;
  const { client, calls } = fakeClient([toolCall("get_budget"), { content: "ok" }]);
  const r = await runAgent({ client, ...base, ctx: { planId: "p1", today: "2026-11-04", supabase: boom } });
  expect(r.reply).toBe("ok");
  expect(r.toolCalls[0].result).toEqual({ error: "tool_failed" });
  expect(JSON.stringify(calls[1])).not.toContain("secret stack");
});

test("알 수 없는 툴 이름은 에러 결과", async () => {
  const { client } = fakeClient([toolCall("nope"), { content: "ok" }]);
  const r = await runAgent({ client, ...base, ctx: ctx() });
  expect(r.toolCalls[0].result).toEqual({ error: "unknown_tool" });
});

test("maxSteps 초과 시 중단하고 안내 문구", async () => {
  const { client, calls } = fakeClient([toolCall("get_tip", "{}")]);
  const r = await runAgent({ client, ...base, ctx: ctx(), maxSteps: 5 });
  expect(calls).toHaveLength(5);
  expect(r.reply).toMatch(/다시 질문/);
});

test("모델 선택", () => {
  expect(modelForStage(1)).toBe("deepseek-v4-flash");
  expect(modelForStage(3)).toBe("deepseek-v4-pro");
  expect(modelForStage(5)).toBe("deepseek-v4-pro");
});

test("시스템 프롬프트 필수 문구", () => {
  expect(SYSTEM_PROMPT).toMatch(/직접 계산/);
  expect(SYSTEM_PROMPT).toMatch(/기준일/);
  expect(SYSTEM_PROMPT).toMatch(/stale/);
  expect(SYSTEM_PROMPT).toMatch(/ambiguous/);
  expect(SYSTEM_PROMPT).toMatch(/get_tip/);
  expect(SYSTEM_PROMPT).toContain("dummy_data:loan_products:bank");
  expect(SYSTEM_PROMPT).toMatch(/상한/);
});

test("LLM에 보내는 메시지에 프로필 원값이 없다", async () => {
  const profile = { plan_id: "p1", cash_assets: 123456789, annual_income: 987654321, owned_house_count: 0, is_first_time: false };
  const { client, calls } = fakeClient([toolCall("get_budget"), { content: "ok" }]);
  await runAgent({ client, ...base, ctx: ctx({ financial_profiles: [profile] }) });
  const sent = JSON.stringify(calls);
  expect(sent).not.toContain("987654321");
});

test("DeepSeek 오류는 runAgent 밖으로 전파된다 (route가 502 처리)", async () => {
  const { client } = fakeClient([new Error("down")]);
  await expect(runAgent({ client, ...base, ctx: ctx() })).rejects.toThrow("down");
});

test("kstToday: KST 날짜 경계", () => {
  expect(kstToday(new Date("2026-11-03T15:30:00Z"))).toBe("2026-11-04");
  expect(kstToday(new Date("2026-11-03T14:59:59Z"))).toBe("2026-11-03");
});
