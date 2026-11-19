import type OpenAI from "openai";
import { expect, test } from "vitest";
import { inputHash, parseCheckReply, runCheck } from "./check";
import { fakeDb } from "./fake-db";
import { MAX_STEPS_REPLY } from "./orchestrator";

const fakeClient = (replies: { content: string | null; tool_calls?: unknown[] }[]) => {
  const calls: { messages: { role: string; content: string }[] }[] = [];
  let i = 0;
  const client = { chat: { completions: { create: async (req: never) => {
    calls.push(JSON.parse(JSON.stringify(req)));
    return { choices: [{ message: { role: "assistant", ...replies[Math.min(i++, replies.length - 1)] } }] };
  } } } } as unknown as Pick<OpenAI, "chat">;
  return { client, calls };
};
const ctx = { planId: "p1", today: "2026-11-18", supabase: fakeDb({ financial_profiles: [] }) };
const json = (o: unknown) => ({ content: JSON.stringify(o) });

test("툴을 부른 뒤 JSON 브리핑을 파싱하고 툴 이름을 남긴다", async () => {
  const { client, calls } = fakeClient([
    { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "get_budget", arguments: "{}" } }] },
    json({ summary: "대출이 DSR에 묶여 있습니다.", questions: ["DSR이 뭔가요?"], action: null }),
  ]);
  const r = await runCheck({ client, stage: 1, ctx, priorSummaries: [] });
  expect(r).toEqual({ summary: "대출이 DSR에 묶여 있습니다.", questions: ["DSR이 뭔가요?"], action: null, tools: ["get_budget"] });
  expect(calls[0].messages[0].content).toContain("AI 점검 받기");
  expect(calls[0].messages[1].content).toContain("[AI 점검] 1단계");
});

test("이전 단계 요약을 점검 입력에 넣는다(단계 간 기억)", async () => {
  const { client, calls } = fakeClient([json({ summary: "s", questions: [] })]);
  await runCheck({ client, stage: 3, ctx, priorSummaries: [{ stage: 1, summary: "대출이 DSR에 묶임" }] });
  expect(calls[0].messages[1].content).toContain("- 1단계: 대출이 DSR에 묶임");
});

test("스텝 한도를 넘기면 실패로 본다", async () => {
  const { client } = fakeClient([{ content: null, tool_calls: [{ id: "c", type: "function", function: { name: "get_budget", arguments: "{}" } }] }]);
  await expect(runCheck({ client, stage: 1, ctx, priorSummaries: [] })).rejects.toThrow("check_incomplete");
  expect(MAX_STEPS_REPLY).toBeTruthy();
});

test("parseCheckReply: 코드 블록·잘못된 질문·action도 견딘다", () => {
  expect(parseCheckReply('```json\n{"summary":"a","questions":["q"],"action":{"field":"priority.price_max","value":"prefer","label":"최고가를 선호로"}}\n```'))
    .toEqual({ summary: "a", questions: ["q"], action: { field: "priority.price_max", value: "prefer", label: "최고가를 선호로" } });
  expect(parseCheckReply('{"summary":"a","questions":"x","action":{"field":"price_max; drop","value":"must"}}'))
    .toEqual({ summary: "a", questions: [], action: null });
  expect(parseCheckReply("그냥 문장")).toEqual({ summary: "그냥 문장", questions: [], action: null });
});

test("inputHash: 시각·id만 다르면 같고, 내용·날짜가 다르면 다르다", () => {
  const base = { profile: { annual_income: 1, updated_at: "a" }, cond: { id: "x", price_max: 2 }, favoriteIds: [2, 1], today: "2026-11-18" };
  const h = inputHash(base);
  expect(inputHash({ ...base, profile: { annual_income: 1, updated_at: "b" }, cond: { id: "y", price_max: 2 }, favoriteIds: [1, 2] })).toBe(h);
  expect(inputHash({ ...base, cond: { id: "x", price_max: 3 } })).not.toBe(h);
  expect(inputHash({ ...base, today: "2026-11-19" })).not.toBe(h);
});
