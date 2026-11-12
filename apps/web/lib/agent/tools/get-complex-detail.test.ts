import { expect, test } from "vitest";
import { runTool } from "../tool";
import { getComplexDetail } from "./get-complex-detail";
import { complex, mk, saved } from "./test-fixtures";

const row = (id: number, o: Record<string, unknown> = {}) => ({
  id, name: `단지${id}`, region_code: "1168010300", jibun_address: "개포동 1", road_address: null,
  approval_date: "2000-03-01", household_count: 1500, building_count: 10, parking_count: 1500,
  site_area_m2: 60000, floor_area_ratio: 200, building_coverage_ratio: 20, data_as_of: "2026-11-02", ...o,
});
const trade = { deal_date: "2026-10-01", deal_amount: 800_000_000, exclusive_area: 84, floor: 5 };
type Data = {
  complex: { id: number; approval_year: number | null; land_share_m2: number }; fit: { score: number } | null;
  trades: unknown[]; monthly: unknown[]; neighbors: { basis: string; count: number }; criteria: { area_min: number | null; months: number };
  error?: string;
};

function setup(o: Parameters<typeof mk>[0] = {}, rows = [row(1), row(9, { region_code: "1100000000" })], trades: unknown[] = [trade]) {
  const m = mk(o);
  const db = m.ctx.supabase as unknown as { rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown[] }>; from: (t: string) => unknown };
  const rpc = db.rpc.bind(db);
  const from = db.from.bind(db);
  const calls: Record<string, Record<string, unknown>> = {};
  db.rpc = (n, a) => {
    calls[n] = a;
    if (n === "complex_trades") return Promise.resolve({ data: trades });
    if (n === "complex_monthly_prices") return Promise.resolve({ data: trades.length ? [{ month: "2026-10", median_price: 800_000_000, deal_count: 1 }] : [] });
    return rpc(n, a);
  };
  db.from = (t: string) => (t === "complexes" ? new FakeComplexes(rows) : from(t));
  return { ...m, calls };
}
// fakeDb에 complexes 테이블이 필요해 간단한 체인만 흉내
class FakeComplexes {
  constructor(private rows: Record<string, unknown>[]) {}
  select() { return this; }
  eq(c: string, v: unknown) { this.rows = this.rows.filter((r) => r[c] === v); return this; }
  maybeSingle() { return Promise.resolve({ data: this.rows[0] ?? null, error: null }); }
}

test("returns detail with neighbors and notices", async () => {
  const { ctx, calls } = setup();
  const r = await getComplexDetail.run({ complex_id: 1 }, ctx);
  const d = r.data as Data;
  expect(d.complex).toMatchObject({ id: 1, approval_year: 2000, land_share_m2: 40 });
  expect(d.trades).toHaveLength(1);
  expect(d.monthly).toHaveLength(1);
  expect(d.fit).toMatchObject({ score: 100 });
  expect(d.neighbors).toMatchObject({ basis: "same_dong", count: 2 });
  expect(d.criteria).toEqual({ area_min: 80, area_max: 90, months: 24 });
  expect(calls.complex_trades).toMatchObject({ p_complex_id: 1, area_min: 80, area_max: 90 });
  expect(r.notices).toEqual(expect.arrayContaining(["no_location_data", "no_redevelopment_data", "land_share_is_average"]));
  expect(r.notices).not.toContain("no_recent_trades");
  expect(r.as_of).toMatchObject({ "complexes:building_ledger": expect.any(String), "transactions:apartment": expect.any(String) });
});

test("complex_not_found", async () => {
  const { ctx } = setup();
  expect((await getComplexDetail.run({ complex_id: 404 }, ctx)).data).toEqual({ error: "complex_not_found" });
});

test("fit null outside desired region, no_recent_trades when empty", async () => {
  const { ctx } = setup({}, [row(9, { region_code: "1100000000" })], []);
  const r = await getComplexDetail.run({ complex_id: 9 }, ctx);
  expect((r.data as Data).fit).toBeNull();
  expect(r.notices).toContain("no_recent_trades");
});

test("조건 미저장이어도 면적 없이 진행, as_of는 직접 조회", async () => {
  const { ctx } = setup({ sets: [saved({ region_codes: [] })], rows: [complex(1)] });
  const r = await getComplexDetail.run({ complex_id: 1 }, ctx);
  const d = r.data as Data;
  expect(d.fit).toBeNull();
  expect(d.criteria.area_min).toBeNull();
  expect(r.as_of).toMatchObject({ "complexes:building_ledger": "2026-11-02", "transactions:apartment": "2026-11-07" });
});

test("rejects non-integer id", async () => {
  const { ctx } = setup();
  expect(await runTool(getComplexDetail, '{"complex_id":1.5}', ctx)).toHaveProperty("error");
});
