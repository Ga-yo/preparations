import { beforeEach, describe, expect, test, vi } from "vitest";

const PLAN = "11111111-1111-4111-8111-111111111111";
type Call = { table: string; op: string; args: unknown[]; chain: [string, unknown[]][] };
let calls: Call[];

// 호출을 기록하는 체인 가짜 (4단계 actions.test.ts와 같은 방식)
const chainFor = (table: string, op: string, args: unknown[]) => {
  const call: Call = { table, op, args, chain: [] };
  calls.push(call);
  const p: unknown = new Proxy(() => {}, {
    get: (_, k: string) =>
      k === "then" ? (f: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(f)
        : (...a: unknown[]) => { call.chain.push([k, a]); return p; },
  });
  return p;
};
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => new Proxy({}, { get: (_, op: string) => (...a: unknown[]) => chainFor(table, op, a) }),
  }),
}));

const { parseIds, enterStage5 } = await import("./actions");

beforeEach(() => { calls = []; });

describe("parseIds", () => {
  test("parseIds dedupes and keeps favorites only", () => {
    expect(parseIds("3,3,9,1", [1, 3])).toEqual([3, 1]);
  });
  test("parseIds caps at four", () => {
    expect(parseIds("1,2,3,4,5", [1, 2, 3, 4, 5])).toEqual([1, 2, 3, 4]);
  });
  test("parseIds ignores garbage", () => {
    expect(parseIds("a,-1,0,2.5", [1, 2])).toEqual([]);
    expect(parseIds(["1", "2"], [1, 2, 3])).toEqual([1, 2]);
    expect(parseIds(["1,2", "3"], [1, 2, 3])).toEqual([1, 2, 3]);
  });
  test("parseIds defaults to first four favorites", () => {
    expect(parseIds(undefined, [5, 4, 3, 2, 1])).toEqual([5, 4, 3, 2]);
    expect(parseIds("", [5, 4])).toEqual([5, 4]);
  });
});

describe("enterStage5", () => {
  test("enterStage5 only raises stage", async () => {
    await enterStage5(PLAN);
    const u = calls.find((c) => c.table === "plans" && c.op === "update")!;
    expect(u.args[0]).toEqual({ current_stage: 5 });
    expect(u.chain).toContainEqual(["eq", ["id", PLAN]]);
    expect(u.chain).toContainEqual(["lt", ["current_stage", 5]]);
  });
  test("enterStage5 rejects invalid plan id", async () => {
    await expect(enterStage5("x")).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});
