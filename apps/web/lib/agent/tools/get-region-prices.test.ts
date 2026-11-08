import { expect, test } from "vitest";
import { fakeDb } from "../fake-db";
import { runTool, type ToolContext } from "../tool";
import { getRegionPrices } from "./get-region-prices";

const rule = (rule_type: string, value: number) => ({
  id: 1, rule_type, area_type: null, region_prefix: null, buyer_type: null, lender_type: null,
  price_min: null, price_max: null, value, unit: "percent",
  effective_date: "2025-07-01", end_date: null, source: `s-${rule_type}`, source_url: null, note: null,
});
const product = {
  id: 1, provider: "A은행", name: "주담대", product_type: "bank", rate_type: "variable",
  rate_min: 4, rate_max: 5, max_amount: null, max_term_years: null, income_max: null,
  house_price_max: null, exclusive_area_max: null, asset_max: null, requires_first_time: false,
  requires_homeless: false, requires_newlywed: false, requires_newborn: false,
  effective_date: "2025-01-01", end_date: null, data_as_of: "2026-11-01", source: "t", source_url: null, source_key: null, note: null,
};
const profile = {
  plan_id: "p1", cash_assets: 150_000_000, annual_income: 120_000_000, existing_debt: null,
  existing_debt_annual_payment: 3_000_000, extra_funds: 50_000_000, owned_house_count: 0,
  is_first_time: false, is_newlywed: false, has_newborn: false,
};
const regions = [
  { code: "1100000000", full_name: "서울특별시", is_active: true },
  { code: "1168000000", full_name: "서울특별시 강남구", is_active: true },
  { code: "1114000000", full_name: "서울특별시 중구", is_active: true },
  { code: "2611000000", full_name: "부산광역시 중구", is_active: true },
];
const stat = (sigungu_code: string, median_price: number, deal_count = 10) => ({
  sigungu_code, sigungu_name: `이름${sigungu_code}`, median_price, deal_count, latest_deal_date: "2026-10-30",
});

function mk(o: { rows?: ReturnType<typeof stat>[]; withProfile?: boolean; saved?: string[]; savedArea?: [number, number]; txAsOf?: string } = {}) {
  const calls: Record<string, unknown>[] = [];
  const ctx: ToolContext = {
    planId: "p1", today: "2026-11-04",
    supabase: fakeDb(
      {
        financial_profiles: o.withProfile === false ? [] : [profile],
        loan_rules: [rule("ltv", 70), rule("dsr", 40), rule("stress_rate", 1.5)],
        regulated_areas: [], loan_products: [product], regions,
        condition_sets: o.saved || o.savedArea
          ? [{ plan_id: "p1", region_codes: o.saved ?? [], area_min: o.savedArea?.[0] ?? null, area_max: o.savedArea?.[1] ?? null }]
          : [],
        data_freshness: [
          { dataset: "transactions:apartment", as_of: o.txAsOf ?? "2026-11-03", source: "MOLIT" },
          { dataset: "loan_products:bank", as_of: "2026-11-01", source: "FSS" },
        ],
      },
      {
        region_price_stats: (args) => {
          calls.push(args);
          return o.rows ?? [stat(String(args.sigungu_prefix).padEnd(5, "0"), 500_000_000)];
        },
      },
    ),
  };
  return { ctx, calls };
}
type Row = { sigungu_code: string; low_sample: boolean; max_budget?: number; affordable?: boolean };
const rowsOf = (r: { data: unknown }) => (r.data as { regions: Row[] }).regions;

test("시군구명 → 5자리 접두사, months 기본 12, as_of 포함", async () => {
  const { ctx, calls } = mk();
  const r = await getRegionPrices.run({ region_name: "강남구" }, ctx);
  expect(calls).toEqual([{ sigungu_prefix: "11680", housing_type: "apartment", months: 12 }]);
  expect(r.as_of).toMatchObject({ "transactions:apartment": "2026-11-03" });
});
test("시도명 → 2자리 접두사", async () => {
  const { ctx, calls } = mk();
  await getRegionPrices.run({ region_name: "서울특별시" }, ctx);
  expect(calls[0].sigungu_prefix).toBe("11");
});
test("지역 생략 시 저장된 희망 지역의 시군구별 호출", async () => {
  const { ctx, calls } = mk({ saved: ["1168010300", "1168000000", "4111100000"] });
  await getRegionPrices.run({}, ctx);
  expect(calls.map((c) => c.sigungu_prefix)).toEqual(["11680", "41111"]);
});
test("지역 생략 + 저장 없음 → region_required", async () => {
  const { ctx, calls } = mk();
  expect((await getRegionPrices.run({}, ctx)).data).toEqual({ error: "region_required" });
  expect(calls).toEqual([]);
});
test("모호한 지역 → region_ambiguous + candidates", async () => {
  const { ctx } = mk();
  expect((await getRegionPrices.run({ region_name: "중구" }, ctx)).data).toMatchObject({
    error: "region_ambiguous", candidates: [{ code: "1114000000" }, { code: "2611000000" }],
  });
});
test("area_min > area_max → area_range_invalid, RPC 미호출", async () => {
  const { ctx, calls } = mk();
  expect((await getRegionPrices.run({ region_name: "강남구", area_min: 90, area_max: 60 }, ctx)).data).toEqual({ error: "area_range_invalid" });
  expect(calls).toEqual([]);
});
test("면적 인자는 RPC에 그대로 전달", async () => {
  const { ctx, calls } = mk();
  await getRegionPrices.run({ region_name: "강남구", area_min: 59, area_max: 85, months: 6 }, ctx);
  expect(calls[0]).toEqual({ sigungu_prefix: "11680", housing_type: "apartment", months: 6, area_min: 59, area_max: 85 });
});
test("months 25는 검증 실패", async () => {
  expect(await runTool(getRegionPrices, '{"region_name":"강남구","months":25}', mk().ctx)).toHaveProperty("error");
});
test("예산 대비: 중위 1억 행은 affordable true, 100억 행은 false", async () => {
  const { ctx } = mk({ rows: [stat("11110", 100_000_000), stat("11140", 10_000_000_000)] });
  const [a, b] = rowsOf(await getRegionPrices.run({ region_name: "서울특별시" }, ctx));
  expect([a.affordable, b.affordable]).toEqual([true, false]);
  expect(a.max_budget).toBeGreaterThan(0);
  expect(a.max_budget).toBe(b.max_budget);
});
test("프로필 없으면 notices에 profile_missing, affordable 키 없음", async () => {
  const r = await getRegionPrices.run({ region_name: "강남구" }, mk({ withProfile: false }).ctx);
  expect(r.notices).toContain("profile_missing");
  expect(rowsOf(r)[0]).not.toHaveProperty("affordable");
});
test("거래 4건 low_sample true, 5건 false", async () => {
  const { ctx } = mk({ rows: [stat("11110", 1e8, 4), stat("11140", 1e8, 5)] });
  expect(rowsOf(await getRegionPrices.run({ region_name: "서울특별시" }, ctx)).map((x) => x.low_sample)).toEqual([true, false]);
});
test("결과 0행이면 notices에 no_transactions", async () => {
  const r = await getRegionPrices.run({ region_name: "강남구" }, mk({ rows: [] }).ctx);
  expect(r.notices).toContain("no_transactions");
});
test("실거래 기준일 8일 전이면 stale에 transactions:apartment", async () => {
  expect((await getRegionPrices.run({ region_name: "강남구" }, mk({ txAsOf: "2026-10-27" }).ctx)).stale).toContain("transactions:apartment");
});
test("소득 원값이 결과에 없음", async () => {
  expect(JSON.stringify(await getRegionPrices.run({ region_name: "강남구" }, mk().ctx))).not.toContain("120000000");
});
test("면적 생략 시 저장된 희망 면적을 RPC와 criteria에 사용", async () => {
  const { ctx, calls } = mk({ saved: ["1168000000"], savedArea: [59, 85] });
  const r = await getRegionPrices.run({}, ctx);
  expect(calls[0]).toMatchObject({ area_min: 59, area_max: 85 });
  expect((r.data as { criteria: unknown }).criteria).toEqual({ months: 12, area_min: 59, area_max: 85 });
});
test("면적 인자가 저장값보다 우선", async () => {
  const { ctx, calls } = mk({ savedArea: [59, 85] });
  await getRegionPrices.run({ region_name: "강남구", area_min: 70 }, ctx);
  expect(calls[0]).toMatchObject({ area_min: 70, area_max: 85 });
});
test("인자와 저장값을 합친 범위가 뒤집히면 area_range_invalid", async () => {
  const { ctx, calls } = mk({ savedArea: [59, 85] });
  expect((await getRegionPrices.run({ region_name: "강남구", area_min: 100 }, ctx)).data).toEqual({ error: "area_range_invalid" });
  expect(calls).toEqual([]);
});
