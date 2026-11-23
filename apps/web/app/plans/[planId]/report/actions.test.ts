import { beforeEach, expect, test, vi } from "vitest";

const PLAN = "11111111-1111-4111-8111-111111111111";
let inserts: { table: string; row: Record<string, unknown> }[];
let favorites: { complex_id: number; name: string }[];
const compareForPlan = vi.fn(async () => ({ data: { items: [] }, as_of: { "transactions:apartment": "2026-11-13" } }));

const rows: Record<string, unknown[]> = {
  condition_sets: [{ region_codes: ["1168000000"], region_reason: "직장", commute_region_code: null, area_min: 59, area_max: 85, price_max: null, redevelopment_interest: false }],
  regions: [{ code: "1168000000", full_name: "서울특별시 강남구" }],
  tips: [{ field_key: "checklist", title: "t", body: "b", caution: null }],
};
const query = (table: string) => {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit"]) q[m] = () => q;
  q.maybeSingle = async () => ({ data: rows[table]?.[0] ?? null, error: null });
  q.then = (f: (v: unknown) => unknown) => Promise.resolve({ data: rows[table] ?? [], error: null }).then(f);
  q.insert = async (row: Record<string, unknown>) => { inserts.push({ table, row }); return { error: null }; };
  return q;
};
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: query, auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }),
}));
vi.mock("../stage/1/actions", () => ({ getBudgetForPlan: async () => ({ data: { ownFunds: 1 }, as_of: { loan_rules: "2025-07-01" } }) }));
vi.mock("../stage/4/actions", () => ({ favoriteComplexIds: async () => favorites }));
vi.mock("../stage/5/actions", async (orig) => ({ ...(await orig<typeof import("../stage/5/actions")>()), compareForPlan }));

const budgetsByRegion = vi.fn(async (): Promise<unknown> => null);
vi.mock("@/lib/agent/tools/get-budget", () => ({ budgetsByRegion }));

const freshCheckSummary = vi.fn(async (): Promise<string | null> => null);
vi.mock("../_components/assistant", () => ({ freshCheckSummary }));

const { createReport } = await import("./actions");

beforeEach(() => { inserts = []; compareForPlan.mockClear(); freshCheckSummary.mockClear(); });

test("saves snapshot with compare for two favorites", async () => {
  favorites = [{ complex_id: 1, name: "a" }, { complex_id: 2, name: "b" }];
  await createReport(PLAN);
  const { table, row } = inserts[0];
  expect(table).toBe("reports");
  expect(row).toMatchObject({ plan_id: PLAN, user_id: "u1" });
  const p = row.payload as { version: number; compare: unknown; conditions: { region_names: string[] }; checklist: unknown[]; as_of: Record<string, string> };
  expect(p.version).toBe(1);
  expect(compareForPlan).toHaveBeenCalledWith(PLAN, [1, 2]);
  expect(p.conditions.region_names).toEqual(["서울특별시 강남구"]);
  expect(p.checklist).toHaveLength(1);
  expect(p.as_of).toMatchObject({ loan_rules: "2025-07-01", "transactions:apartment": "2026-11-13" });
});

test("one favorite skips compare", async () => {
  favorites = [{ complex_id: 1, name: "a" }];
  await createReport(PLAN);
  expect(compareForPlan).not.toHaveBeenCalled();
  expect((inserts[0].row.payload as { compare: unknown }).compare).toBeNull();
});

test("rejects invalid plan id before any write", async () => {
  await expect(createReport("x")).rejects.toThrow();
  expect(inserts).toHaveLength(0);
});


test("현재 입력의 5단계 AI 점검이 있으면 해설로 담는다", async () => {
  favorites = [];
  freshCheckSummary.mockResolvedValueOnce("5단계 점검 요약");
  await createReport(PLAN);
  expect(freshCheckSummary).toHaveBeenCalledWith(expect.anything(), PLAN, 5);
  expect(inserts[0].row.narrative).toBe("5단계 점검 요약");
});

test("지역을 저장했으면 지역 기준 예산을 담고 지역 미지정 예산은 쓰지 않는다", async () => {
  favorites = [];
  const seoul = { data: { maxPrice: 6 }, as_of: { loan_rules: "2025-10-16" } };
  budgetsByRegion.mockResolvedValueOnce([{ region_codes: ["1168000000"], budget: seoul }]);
  await createReport(PLAN);
  expect(budgetsByRegion).toHaveBeenCalledWith(expect.anything(), PLAN, expect.any(String), ["1168000000"], 85);
  const p = inserts[0].row.payload as { budget: unknown; region_budgets: unknown };
  expect(p.budget).toEqual(seoul);
  expect(p.region_budgets).toEqual([{ region_names: ["서울특별시 강남구"], budget: seoul }]);
});

test("지역 예산을 못 구하면(프로필 없음) 기존 예산 하나만 담는다", async () => {
  favorites = [];
  await createReport(PLAN);
  const p = inserts[0].row.payload as { budget: unknown; region_budgets?: unknown };
  expect(p.budget).toMatchObject({ data: { ownFunds: 1 } });
  expect(p.region_budgets).toBeUndefined();
});

test("정비구역 안 관심 단지가 있으면 정비구역 안내까지 담고, 없으면 뺀다", async () => {
  favorites = [{ complex_id: 1, name: "a" }, { complex_id: 2, name: "b" }];
  const saved = rows.tips;
  rows.tips = [{ field_key: "checklist", title: "t", body: "b", caution: null }, { field_key: "redevelopment", title: "r", body: "b", caution: null }];
  try {
    compareForPlan.mockResolvedValueOnce({ data: { items: [{ risks: ["redevelopment_in_zone"] }] }, as_of: {} } as never);
    await createReport(PLAN);
    expect((inserts[0].row.payload as { checklist: { title: string }[] }).checklist.map((t) => t.title)).toEqual(["t", "r"]);
    await createReport(PLAN);
    expect((inserts[1].row.payload as { checklist: { title: string }[] }).checklist.map((t) => t.title)).toEqual(["t"]);
  } finally { rows.tips = saved; }
});
