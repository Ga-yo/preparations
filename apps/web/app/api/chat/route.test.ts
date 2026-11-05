import { beforeEach, expect, test, vi } from "vitest";
import { fakeDb } from "@/lib/agent/fake-db";

const PLAN = "11111111-1111-4111-8111-111111111111";
let used = 0;
const rpc = vi.fn(async () => ({ data: used, error: null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () =>
    Object.assign(fakeDb({ plans: [{ id: PLAN, current_stage: 1 }], chat_messages: [] }), {
      auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
      rpc,
    }),
}));

const { POST, DAILY_CHAT_LIMIT } = await import("./route");
const call = () =>
  POST(new Request("http://x/api/chat", { method: "POST", body: JSON.stringify({ plan_id: PLAN, message: "LTV가 뭐야?" }) }));

beforeEach(() => {
  rpc.mockClear();
  vi.stubEnv("DEEPSEEK_API_KEY", ""); // LLM 호출 전 단계까지만 검증
});

test("하루 한도를 넘으면 429이고 LLM 단계로 가지 않는다", async () => {
  used = DAILY_CHAT_LIMIT + 1;
  const res = await call();
  expect(res.status).toBe(429);
  expect(await res.json()).toEqual({ error: "rate_limited", limit: DAILY_CHAT_LIMIT });
  expect(rpc).toHaveBeenCalledWith("bump_chat_usage");
});

test("한도 이내면 통과한다 (키 없음 → 502까지 진행)", async () => {
  used = DAILY_CHAT_LIMIT;
  const res = await call();
  expect(res.status).toBe(502);
  expect(rpc).toHaveBeenCalledOnce();
});
