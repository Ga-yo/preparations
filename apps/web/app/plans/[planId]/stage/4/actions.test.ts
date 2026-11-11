import { beforeEach, describe, expect, test, vi } from "vitest";

const PLAN = "11111111-1111-4111-8111-111111111111";
type Call = { table: string; op: string; args: unknown[]; chain: [string, unknown[]][] };
let calls: Call[];
let results: Record<string, { data?: unknown; error?: { code: string; message: string } | null }>;

// 호출을 기록하고 "table.op"별 결과를 돌려주는 체인 가짜
const chainFor = (table: string, op: string, args: unknown[]) => {
  const call: Call = { table, op, args, chain: [] };
  calls.push(call);
  const res = () => ({ data: null, error: null, ...results[`${table}.${op}`] });
  const p: unknown = new Proxy(() => {}, {
    get: (_, k: string) =>
      k === "then" ? (f: (v: unknown) => unknown) => Promise.resolve(res()).then(f)
        : (...a: unknown[]) => { call.chain.push([k, a]); return p; },
  });
  return p;
};
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => new Proxy({}, { get: (_, op: string) => (...a: unknown[]) => chainFor(table, op, a) }),
  }),
}));
const loadConditionContext = vi.fn();
vi.mock("@/lib/agent/tools/condition-context", () => ({ loadConditionContext: (...a: unknown[]) => loadConditionContext(...a), MONTHS: 12 }));

const { setFavorite, favoriteComplexIds } = await import("./actions");

const row = { complex_id: 7, name: "a", region_code: "11680", approval_year: 2000, household_count: 500,
  parking_per_household: 1, floor_area_ratio: 200, building_coverage_ratio: 20, land_share_m2: 30, median_price: 5e8, deal_count: 3 };
const ctx = (rows = [row]) => ({
  conditions: { housing_types: [], price_min: null, price_max: 6e8, area_min: null, area_max: null,
    approval_year_min: 2010, household_count_min: null, parking_per_household_min: null, floor_area_ratio_max: null,
    mgmt_fee_per_m2_max: null, rooms_min: null, baths_min: null, floor_pref: null, direction_pref: null, priorities: {} },
  conditionSetId: "set-latest", budgets: [], rows,
});
const find = (table: string, op: string) => calls.find((c) => c.table === table && c.op === op);

beforeEach(() => {
  calls = []; results = {}; loadConditionContext.mockReset();
});

describe("setFavorite", () => {
  test("rejects invalid ids", async () => {
    expect(await setFavorite("x", 7, true)).toEqual({ ok: false, error: "invalid" });
    expect(await setFavorite(PLAN, 0, true)).toEqual({ ok: false, error: "invalid" });
    expect(calls).toHaveLength(0);
  });
  test("upserts with fit from latest set", async () => {
    loadConditionContext.mockResolvedValue(ctx());
    expect(await setFavorite(PLAN, 7, true)).toEqual({ ok: true });
    const [row_, opts] = find("candidates", "upsert")!.args as [Record<string, unknown>, unknown];
    expect(row_).toMatchObject({ condition_set_id: "set-latest", complex_id: 7, is_favorite: true });
    expect(typeof row_.fit_score).toBe("number");
    expect(opts).toEqual({ onConflict: "condition_set_id,complex_id" });
    expect(find("plans", "update")!.args).toEqual([{ current_stage: 4 }]);
  });
  test("complex outside rows saves null fit", async () => {
    loadConditionContext.mockResolvedValue(ctx([]));
    await setFavorite(PLAN, 7, true);
    expect(find("candidates", "upsert")!.args[0]).toMatchObject({ fit_score: null, pros: [], cons: [] });
  });
  test("rejects plan of another user", async () => {
    loadConditionContext.mockResolvedValue(ctx());
    results["candidates.upsert"] = { error: { code: "42501", message: "rls" } };
    expect(await setFavorite(PLAN, 7, true)).toEqual({ ok: false, error: "not_found" });
    expect(find("plans", "update")).toBeUndefined();
  });
  test("no conditions: visible plan -> conditions_required, hidden -> not_found", async () => {
    loadConditionContext.mockResolvedValue({ error: "conditions_required" });
    results["plans.select"] = { data: { id: PLAN } };
    expect(await setFavorite(PLAN, 7, true)).toEqual({ ok: false, error: "conditions_required" });
    results["plans.select"] = { data: null };
    expect(await setFavorite(PLAN, 7, true)).toEqual({ ok: false, error: "not_found" });
  });
  test("other db errors throw", async () => {
    loadConditionContext.mockResolvedValue(ctx());
    results["candidates.upsert"] = { error: { code: "XX000", message: "boom" } };
    await expect(setFavorite(PLAN, 7, true)).rejects.toThrow("boom");
  });
  test("unfavorite clears all sets of plan", async () => {
    results["condition_sets.select"] = { data: [{ id: "s1" }, { id: "s2" }] };
    expect(await setFavorite(PLAN, 7, false)).toEqual({ ok: true });
    const u = find("candidates", "update")!;
    expect(u.args).toEqual([{ is_favorite: false }]);
    expect(u.chain).toContainEqual(["in", ["condition_set_id", ["s1", "s2"]]]);
    expect(u.chain).toContainEqual(["eq", ["complex_id", 7]]);
  });
});

describe("favoriteComplexIds", () => {
  test("returns deduped ids with names", async () => {
    results["candidates.select"] = { data: [
      { complex_id: 7, complexes: { name: "가" } }, { complex_id: 7, complexes: { name: "가" } }, { complex_id: 9, complexes: null },
    ] };
    expect(await favoriteComplexIds(PLAN)).toEqual([{ complex_id: 7, name: "가" }, { complex_id: 9, name: "단지 9" }]);
  });
});
