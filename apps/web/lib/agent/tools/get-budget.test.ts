import { expect, test } from "vitest";
import { z } from "zod";
import { fakeDb } from "../fake-db";
import { defineTool, runTool, toOpenAiTools, type ToolContext } from "../tool";
import { getBudget } from "./get-budget";
import { getTip } from "./get-tip";
import { toolsForStage } from "./index";

const rule = (rule_type: string, value: number) => ({
  id: 1, rule_type, area_type: null, region_prefix: null, buyer_type: null, lender_type: null,
  price_min: null, price_max: null, value, unit: rule_type === "loan_cap" ? "won" : "percent",
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
  { code: "1114000000", full_name: "서울특별시 중구", is_active: true },
  { code: "2611000000", full_name: "부산광역시 중구", is_active: true },
];
const mk = (asOf: string, source = "FSS", withProfile = true, prof: Record<string, unknown> = profile): ToolContext => ({
  planId: "p1", today: "2026-11-04",
  supabase: fakeDb({
    financial_profiles: withProfile ? [prof] : [],
    loan_rules: [rule("ltv", 70), rule("dsr", 40), rule("stress_rate", 1.5)],
    regulated_areas: [], loan_products: [product], regions,
    data_freshness: [
      { dataset: "loan_products:bank", as_of: asOf, source },
      { dataset: "regulated_areas", as_of: "2026-10-30", source: "x" },
    ],
    tips: [{ slug: "ltv-dsr", stage: 1, field_key: "ltv", title: "LTV", body: "b", caution: null, source: null, sort_order: 1 }],
  }),
});

test("defineTool은 중첩 object 인자를 거부", () => {
  const t = { name: "x", description: "d", async run() { return { data: 1, as_of: {} }; } };
  expect(() => defineTool({ ...t, schema: z.object({ a: z.object({ b: z.string() }) }) })).toThrow();
  expect(() => defineTool({ ...t, schema: z.object({ a: z.array(z.string()).optional() }) })).not.toThrow();
});
test("runTool: 잘못된 인자는 error 결과", async () => {
  expect(await runTool(getTip, '{"slug":1}', mk("2026-11-01"))).toHaveProperty("error");
  expect(await runTool(getTip, "{bad", mk("2026-11-01"))).toHaveProperty("error");
});
test("toolsForStage는 세 툴, OpenAI 형식 변환", () => {
  const o = toOpenAiTools(toolsForStage(1));
  expect(o.map((t) => (t as { function: { name: string } }).function.name)).toEqual(["resolve_region", "get_budget", "get_tip"]);
});
test("get_budget: as_of 포함, 소득 원값 미포함", async () => {
  const r = await getBudget.run({}, mk("2026-11-01"));
  expect(r.as_of).toMatchObject({ "loan_products:bank": "2026-11-01", loan_rules: "2025-07-01", tax_rates: expect.any(String) });
  expect(r.stale).toBeUndefined();
  expect(JSON.stringify(r)).not.toContain("120000000");
  expect((r.data as { loan: { binding?: string } }).loan.binding).toBeDefined();
});
test("get_budget: 상품 데이터가 8일 전이면 stale", async () => {
  expect((await getBudget.run({}, mk("2026-10-27"))).stale).toEqual(["loan_products:bank"]);
});
test("get_budget: DUMMY 출처면 notice", async () => {
  expect((await getBudget.run({}, mk("2026-11-01", "DUMMY test"))).notices).toContain("dummy_data:loan_products:bank");
});
test("get_budget: 프로필 없음", async () => {
  expect(await getBudget.run({}, mk("2026-11-01", "FSS", false))).toEqual({ data: { error: "profile_missing" }, as_of: {} });
});
test("get_budget: 모호·없는 지역은 계산하지 않음", async () => {
  expect((await getBudget.run({ region_name: "중구" }, mk("2026-11-01"))).data).toMatchObject({ error: "region_ambiguous" });
  expect((await getBudget.run({ region_name: "없는구" }, mk("2026-11-01"))).data).toEqual({ error: "region_not_found" });
});
test("get_budget: 면적 0은 검증 실패", async () => {
  expect(await runTool(getBudget, '{"exclusive_area_m2":0}', mk("2026-11-01"))).toHaveProperty("error");
});
test("get_tip: slug로 조회", async () => {
  expect((await getTip.run({ slug: "ltv-dsr" }, mk("2026-11-01"))).data).toMatchObject({ tips: [{ slug: "ltv-dsr" }] });
});
test("get_budget: 대출 0원이면 binding 생략", async () => {
  const r = await getBudget.run({}, mk("2026-11-01", "FSS", true, { ...profile, annual_income: null }));
  const loan = (r.data as { loan: { amount: number } }).loan;
  expect(loan.amount).toBe(0);
  expect(loan).not.toHaveProperty("binding");
});
