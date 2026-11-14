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

const { createReport } = await import("./actions");

beforeEach(() => { inserts = []; compareForPlan.mockClear(); });

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
