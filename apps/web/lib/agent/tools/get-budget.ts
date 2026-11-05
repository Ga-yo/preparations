import { z } from "zod";
import { computeBudget } from "@/lib/calc/budget";
import { TAX_RATES_SOURCE } from "@/lib/calc/tax-rates";
import { resolveRegion } from "../region";
import { defineTool, type ToolContext, type ToolResult } from "../tool";

const STALE_DAYS = 7;
const DEFAULT_AREA_M2 = 84;

const day = (s: string) => Date.parse(`${s}T00:00:00Z`);

export const getBudget = defineTool({
  name: "get_budget",
  description:
    "저장된 재무 프로필로 구매 가능 예산, 대출 한도, 부대비용, 상품별 월 상환액을 계산한다. 숫자는 이 결과만 인용하고 직접 계산하지 않는다.",
  schema: z.object({
    region_name: z.string().max(50).optional().describe("희망 지역명. 코드가 아니라 이름"),
    exclusive_area_m2: z.number().positive().max(300).default(DEFAULT_AREA_M2).describe("전용면적(㎡)"),
  }),
  async run(args, ctx: ToolContext): Promise<ToolResult> {
    const { supabase, planId, today } = ctx;
    const must = <T>(r: { data: T; error: { message: string } | null }): T => {
      if (r.error) throw new Error(r.error.message);
      return r.data;
    };

    const profile = must(await supabase.from("financial_profiles").select("*").eq("plan_id", planId).maybeSingle());
    if (!profile) return { data: { error: "profile_missing" }, as_of: {} };

    let regionCode: string | null = null;
    if (args.region_name) {
      const r = await resolveRegion(supabase, args.region_name);
      if (r.status === "ambiguous") return { data: { error: "region_ambiguous", candidates: r.candidates }, as_of: {} };
      if (r.status === "not_found") return { data: { error: "region_not_found" }, as_of: {} };
      regionCode = r.code;
    }

    const [rules, areas, productsRes, fresh] = await Promise.all([
      supabase.from("loan_rules").select("*"),
      supabase.from("regulated_areas").select("*"),
      supabase.from("loan_products").select("*"),
      supabase.from("data_freshness").select("dataset, as_of, source").in("dataset", ["loan_products:bank", "regulated_areas"]),
    ]);
    const ruleRows = must(rules) ?? [];
    const productRows = must(productsRes) ?? [];

    const result = computeBudget({
      date: today,
      cashAssets: profile.cash_assets ?? 0,
      extraFunds: profile.extra_funds ?? 0,
      annualIncome: profile.annual_income,
      existingDebt: profile.existing_debt ?? 0,
      existingAnnualPayment: profile.existing_debt_annual_payment,
      ownedHouseCount: profile.owned_house_count,
      isFirstTime: profile.is_first_time,
      isNewlywed: profile.is_newlywed,
      hasNewborn: profile.has_newborn,
      regionCode,
      exclusiveAreaM2: args.exclusive_area_m2 ?? DEFAULT_AREA_M2,
      rules: ruleRows,
      areas: must(areas) ?? [],
      products: productRows,
    });

    const f = Object.fromEntries((must(fresh) ?? []).map((x) => [x.dataset, x]));
    const as_of: Record<string, string> = { tax_rates: TAX_RATES_SOURCE.effectiveDate };
    for (const k of ["loan_products:bank", "regulated_areas"]) if (f[k]) as_of[k] = f[k].as_of;
    // loan_rules: 오늘 유효한 규칙 중 effective_date 최신 (사용 규칙만 따로 추적하지 않는 단순화)
    const valid = ruleRows.filter((r) => r.effective_date <= today && (r.end_date === null || r.end_date >= today));
    const pol = (productRows).filter((x) => x.product_type === "policy" && x.effective_date <= today && (x.end_date === null || x.end_date >= today));
    if (pol.length) as_of.policy_loans = pol.map((x) => x.data_as_of).sort().at(-1)!;
    if (valid.length) as_of.loan_rules = valid.map((r) => r.effective_date).sort().at(-1)!;

    // stale은 수집 데이터(상품)에만 적용. 법령·규칙 effective_date는 원래 오래됐을 수 있다.
    const p = as_of["loan_products:bank"];
    const stale = p && day(today) - day(p) > STALE_DAYS * 86_400_000 ? ["loan_products:bank"] : [];
    const notices = f["loan_products:bank"]?.source.startsWith("DUMMY") ? ["dummy_data:loan_products:bank"] : [];

    // loan.amount가 0이면 binding은 자리표시값이라 LLM에 넘기지 않는다(원인은 diagnoses)
    const { binding, ...loan } = result.loan;
    return {
      data: { ...result, loan: result.loan.amount === 0 ? loan : { ...loan, binding } },
      as_of,
      ...(stale.length && { stale }),
      ...(notices.length && { notices }),
    };
  },
});
