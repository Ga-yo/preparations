import { z } from "zod";
import { getBudget } from "@/lib/agent/tools/get-budget";
import { kstToday } from "@/lib/agent/orchestrator";
import type { ToolResult } from "@/lib/agent/tool";

// 만원 입력 → 원. 빈 값은 null, 음수·비정수 거부
const won = z
  .string()
  .optional()
  .transform((s) => (s?.trim() ? Number(s) : null))
  .pipe(z.number().int().min(0).max(1e9).nullable()) // 1e9 만원 = 10조원, 오타 방지 상한
  .transform((n) => (n === null ? null : n * 10_000));
const emptyToNull = (v: unknown) => (v === "" ? null : v);
const check = z.string().optional().transform((s) => s === "on");

export const financialProfileSchema = z.object({
  purpose: z.preprocess(emptyToNull, z.enum(["live", "invest", "both"]).nullish()).transform((v) => v ?? null),
  timeline: z.preprocess(emptyToNull, z.enum(["6m", "1y", "2_3y", "undecided"]).nullish()).transform((v) => v ?? null),
  cash_assets: won,
  annual_income: won,
  income_is_combined: check,
  existing_debt: won,
  existing_debt_annual_payment: won,
  extra_funds: won,
  owned_house_count: z.string().optional().transform((s) => (s?.trim() ? Number(s) : 0)).pipe(z.number().int().min(0).max(100)),
  is_first_time: check,
  is_newlywed: check,
  has_newborn: check,
});

export async function saveFinancialProfile(
  planId: string,
  form: FormData,
): Promise<{ ok: true } | { ok: false; fieldErrors: Record<string, string[]> }> {
  const parsed = financialProfileSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]> };
  const { createClient } = await import("@/lib/supabase/server"); // server-only: 스키마 테스트가 import할 수 있게 지연 로드
  const supabase = await createClient();
  // user_id는 default auth.uid()지만 upsert(update 경로)에서도 RLS가 걸리므로 명시한다
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");
  const { error } = await supabase
    .from("financial_profiles")
    .upsert({ ...parsed.data, plan_id: planId, user_id: user.id });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function getBudgetForPlan(planId: string): Promise<ToolResult> {
  const { createClient } = await import("@/lib/supabase/server"); // server-only: 스키마 테스트가 import할 수 있게 지연 로드
  const supabase = await createClient();
  return getBudget.run({}, { supabase, planId, today: kstToday() });
}
