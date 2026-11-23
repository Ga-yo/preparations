import { expect, test, vi } from "vitest";
import { runTool } from "../tool";
import { getComplexDetail, loadComplexDetail } from "./get-complex-detail";
import { complex, mk, saved } from "./test-fixtures";

const fee = { status: "ok", kapt_code: "A10024564", kapt_name: "개포래미안포레스트", month: "2026-09", common: 400, individual: null, total: 400, per_m2: 2, partial: true, fetched_at: "2026-11-12T10:00:00.000Z" };
const getMgmtFee = vi.fn<(...a: unknown[]) => Promise<typeof fee>>(async () => fee);
vi.mock("@/lib/kapt/mgmt-fee", () => ({ getMgmtFee: (...a: unknown[]) => getMgmtFee(...a) }));

const row = (id: number, o: Record<string, unknown> = {}) => ({
  id, name: `단지${id}`, region_code: "1168010300", jibun_address: "개포동 1", road_address: null,
  approval_date: "2000-03-01", household_count: 1500, building_count: 10, parking_count: 1500,
  site_area_m2: 60000, floor_area_ratio: 200, building_coverage_ratio: 20, data_as_of: "2026-11-02", location: null, ...o,
});
const areaTrades = [
  { area: 59, deal_date: "2026-10-03", deal_amount: 600_000_000, exclusive_area: 59.84, floor: 3, area_total: 3 },
  { area: 84, deal_date: "2026-10-01", deal_amount: 800_000_000, exclusive_area: 84.98, floor: 5, area_total: 1 },
];
const areaMonthly = [
  { area: 59, month: "2026-10", median_price: 600_000_000, deal_count: 3 },
  { area: 84, month: "2025-10", median_price: 1, deal_count: 9 }, // 12개 달력월 밖: 버리고 default_area 집계에도 넣지 않는다
  { area: 84, month: "2026-10", median_price: 800_000_000, deal_count: 1 },
];
type Area = { area: number; label: string; monthly: { month: string; median_price: number | null }[]; latest: { month: string } | null; trades: unknown[]; trade_total: number };
type Data = {
  complex: { id: number; approval_year: number | null; land_share_m2: number }; fit: { score: number } | null;
  areas: Area[]; default_area: number | null; neighbors: { basis: string; count: number };
  criteria: { area_min: number | null; area_max: number | null; chart_months: number };
  error?: string;
};

function setup(o: Parameters<typeof mk>[0] = {}, rows = [row(1), row(9, { region_code: "1100000000" })], trades: unknown[] = areaTrades) {
  const m = mk(o);
  const db = m.ctx.supabase as unknown as { rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown[] }>; from: (t: string) => unknown };
  const rpc = db.rpc.bind(db);
  const from = db.from.bind(db);
  const calls: Record<string, Record<string, unknown>> = {};
  db.rpc = (n, a) => {
    calls[n] = a;
    if (n === "complex_area_trades") return Promise.resolve({ data: trades });
    if (n === "complex_area_monthly_prices") return Promise.resolve({ data: trades.length ? areaMonthly : [] });
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
  expect(d.complex).toMatchObject({ median_price: expect.anything(), deal_count: expect.any(Number) });
  expect(d.areas.map((a) => a.area)).toEqual([59, 84]);
  expect(d.areas[0]).toMatchObject({ label: "59㎡", trade_total: 3, latest: { month: "2026-10" } });
  expect(d.areas[0].trades).toEqual([{ deal_date: "2026-10-03", deal_amount: 600_000_000, exclusive_area: 59.84, floor: 3 }]);
  expect(d.areas[1].monthly).toHaveLength(12);
  expect(d.areas[1].monthly[0].month).toBe("2025-12");
  expect(d.areas[1].monthly[10]).toMatchObject({ month: "2026-10", median_price: 800_000_000 });
  expect(d.default_area).toBe(59);
  expect(d.fit).toMatchObject({ score: 100 });
  expect(d.neighbors).toMatchObject({ basis: "same_dong", count: 2 });
  expect(d.criteria).toEqual({ area_min: 80, area_max: 90.99, chart_months: 12 });
  expect(calls.complex_area_trades).toEqual({ p_complex_id: 1, area_min: 80, area_max: 90.99, lim_per_area: 5 }); // LLM에는 면적별 5건만
  expect(calls.complex_area_monthly_prices).toMatchObject({ p_complex_id: 1, months: 12 });
  expect(calls).not.toHaveProperty("complex_trades");
  expect(calls).not.toHaveProperty("complex_monthly_prices");
  expect(r.notices).toEqual(expect.arrayContaining(["no_location_data", "land_share_is_average"]));
  expect(r.notices).not.toContain("no_redevelopment_data");
  expect((r.data as { redevelopment: unknown }).redevelopment).toEqual({ status: "none", dong_zone_count: 0 });
  expect(r.notices).not.toContain("no_recent_trades");
  expect(r.as_of).toMatchObject({ "complexes:building_ledger": expect.any(String), "transactions:apartment": expect.any(String) });
});

test("page loader asks for 50 trades per area", async () => {
  const { ctx, calls } = setup();
  const r = await loadComplexDetail(1, ctx, 50);
  expect(calls.complex_area_trades).toMatchObject({ lim_per_area: 50 });
  expect((r.data as Data).areas[0].trade_total).toBe(3);
});

test("areas with no deals in the 12 chart months get no tab", async () => {
  const old = { area: 114, deal_date: "2023-05-01", deal_amount: 1_500_000_000, exclusive_area: 114.5, floor: 9, area_total: 1 };
  const { ctx } = setup({}, undefined, [...areaTrades, old]);
  const d = (await getComplexDetail.run({ complex_id: 1 }, ctx)).data as Data;
  expect(d.areas.map((x) => x.area)).toEqual([59, 84]);
});

test("only old trades → no areas, no_recent_trades", async () => {
  const { ctx, calls } = setup();
  const db = ctx.supabase as unknown as { rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown[] }> };
  const rpc = db.rpc.bind(db);
  db.rpc = (n, a) => (n === "complex_area_monthly_prices" ? Promise.resolve({ data: [] }) : rpc(n, a));
  const r = await getComplexDetail.run({ complex_id: 1 }, ctx);
  expect((r.data as Data).areas).toEqual([]);
  expect((r.data as Data).default_area).toBeNull();
  expect(r.notices).toContain("no_recent_trades");
  expect(calls.complex_area_trades).toBeDefined();
});

test("complex_not_found", async () => {
  const { ctx } = setup();
  expect((await getComplexDetail.run({ complex_id: 404 }, ctx)).data).toEqual({ error: "complex_not_found" });
});

test("fit null outside desired region, no_recent_trades when empty", async () => {
  const { ctx } = setup({}, [row(9, { region_code: "1100000000" })], []);
  const r = await getComplexDetail.run({ complex_id: 9 }, ctx);
  expect((r.data as Data).fit).toBeNull();
  expect((r.data as Data).complex).toMatchObject({ median_price: null, deal_count: 0 });
  expect((r.data as Data).areas).toEqual([]);
  expect((r.data as Data).default_area).toBeNull();
  expect(r.notices).toContain("no_recent_trades");
});

test("조건 미저장이어도 면적 없이 진행, as_of는 직접 조회", async () => {
  const { ctx, calls } = setup({ sets: [saved({ region_codes: [] })], rows: [complex(1)] });
  const r = await getComplexDetail.run({ complex_id: 1 }, ctx);
  const d = r.data as Data;
  expect(d.fit).toBeNull();
  expect(d.criteria.area_min).toBeNull();
  expect(calls.complex_area_trades).toEqual({ p_complex_id: 1, lim_per_area: 5 });
  expect(calls.complex_area_monthly_prices).toEqual({ p_complex_id: 1, months: 12 });
  expect(r.as_of).toMatchObject({ "complexes:building_ledger": "2026-11-02", "transactions:apartment": "2026-11-07" });
});

test("rejects non-integer id", async () => {
  const { ctx } = setup();
  expect(await runTool(getComplexDetail, '{"complex_id":1.5}', ctx)).toHaveProperty("error");
});

test("returns nearby and drops no_location_data when located", async () => {
  const nearby = [{ category: "subway_station", name: "개포동역", lines: ["수인분당선"], distance_m: 420 }];
  const { ctx } = setup({ rows: [complex(1), { ...complex(2), nearest_station_m: 1 }].map((r, i) => (i ? r : { ...r, nearest_station_name: "개포동역", nearest_station_m: 420, nearest_elementary_m: 300 })) });
  const db = ctx.supabase as unknown as { rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown[] }> };
  const rpc = db.rpc.bind(db);
  const from0 = (ctx.supabase as unknown as { from: (t: string) => unknown }).from.bind(ctx.supabase);
  db.rpc = (n, a) => (n === "complex_nearby_pois" ? Promise.resolve({ data: nearby }) : rpc(n, a));
  const db2 = ctx.supabase as unknown as { from: (t: string) => unknown };
  db2.from = (t: string) => (t === "complexes" ? new FakeComplexes([row(1, { location: "POINT(127 37)" })]) : from0(t));
  const r = await getComplexDetail.run({ complex_id: 1 }, ctx);
  const d = r.data as { nearby: unknown[]; complex: Record<string, unknown> };
  expect(d.nearby).toEqual(nearby);
  expect(d.complex).toMatchObject({ nearest_station_name: "개포동역", nearest_station_m: 420, nearest_elementary_m: 300 });
  expect(r.notices).not.toContain("no_location_data");
});

test("no_location_data still emitted for an unlocated complex", async () => {
  const { ctx } = setup();
  expect((await getComplexDetail.run({ complex_id: 1 }, ctx)).notices).toContain("no_location_data");
});

test("includes mgmt_fee", async () => {
  const { ctx } = setup();
  const r = await getComplexDetail.run({ complex_id: 1 }, ctx);
  expect((r.data as { mgmt_fee: unknown }).mgmt_fee).toEqual(fee);
  expect(r.as_of).toMatchObject({ mgmt_fee: "2026-09" });
  expect(getMgmtFee).toHaveBeenCalledWith(expect.objectContaining({ id: 1, name: "단지1", region_code: "1168010300", jibun_address: "개포동 1" }), ctx.today);
});

test("no mgmt_fee when conditions are not saved", async () => {
  getMgmtFee.mockClear();
  const { ctx } = setup({ sets: [saved({ region_codes: [] })], rows: [complex(1)] });
  const r = await getComplexDetail.run({ complex_id: 1 }, ctx);
  expect(getMgmtFee).not.toHaveBeenCalled();
  expect(r.data).not.toHaveProperty("mgmt_fee");
  expect(r.as_of).not.toHaveProperty("mgmt_fee");
});

test("no mgmt_fee and no K-apt call for a complex outside the user's regions", async () => {
  getMgmtFee.mockClear();
  const { ctx } = setup();
  const r = await getComplexDetail.run({ complex_id: 9 }, ctx);
  expect(getMgmtFee).not.toHaveBeenCalled();
  expect(r.data).not.toHaveProperty("mgmt_fee");
});

test("K-apt hang becomes mgmt_fee error after the deadline", async () => {
  vi.useFakeTimers();
  try {
    getMgmtFee.mockImplementationOnce(() => new Promise(() => {}));
    const { ctx } = setup();
    const p = getComplexDetail.run({ complex_id: 1 }, ctx);
    await vi.advanceTimersByTimeAsync(6000);
    const r = await p;
    expect((r.data as { mgmt_fee: unknown }).mgmt_fee).toEqual({ status: "error" });
  } finally {
    vi.useRealTimers();
  }
});

const project = { complex_id: 1, region_code: "1168010300", name: "개포구역", project_type: "reconstruction", stage: "관리처분인가", stage_date: "2025-09-29" };

test("detail replaces no_redevelopment_data", async () => {
  const { ctx } = setup({ redevelopment: [project] });
  const r = await getComplexDetail.run({ complex_id: 1 }, ctx);
  expect((r.data as { redevelopment: unknown }).redevelopment).toMatchObject({ status: "in_zone", project: { stage: "관리처분인가" } });
  expect(r.notices).not.toContain("no_redevelopment_data");
});

test("detail marks not_covered outside seoul", async () => {
  const { ctx } = setup({}, [row(5, { region_code: "4113510300" })]);
  const r = await getComplexDetail.run({ complex_id: 5 }, ctx);
  expect((r.data as { redevelopment: unknown }).redevelopment).toEqual({ status: "not_covered" });
  expect(r.notices).toContain("redevelopment_not_covered");
});

test("detail carries park shop and commute values", async () => {
  const { ctx } = setup({ rows: [{ ...complex(1), nearest_park_m: 210, shop_count_500m: 42, commute_m: 3100 }, complex(2)] });
  const d = (await getComplexDetail.run({ complex_id: 1 }, ctx)).data as { complex: Record<string, unknown> };
  expect(d.complex).toMatchObject({ nearest_park_m: 210, shop_count_500m: 42, commute_m: 3100 });
});
