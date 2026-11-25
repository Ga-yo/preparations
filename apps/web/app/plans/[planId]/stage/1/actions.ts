import { z } from "zod";
import { getBudget } from "@/lib/agent/tools/get-budget";
import { kstToday } from "@/lib/agent/orchestrator";
import type { ToolResult } from "@/lib/agent/tool";

// 만원 입력 → 원. 빈 값은 null, 음수·비정수 거부. 입력칸이 붙이는 천 단위 콤마는 뺀다
const won = z
  .string()
  .optional()
  .transform((s) => (s?.trim() ? Number(s.replace(/,/g, "")) : null))
  .pipe(z.number().int().min(0).max(1e9).nullable()) // 1e9 만원 = 10조원, 오타 방지 상한
  .transform((n) => (n === null ? null : n * 10_000));
const emptyToNull = (v: unknown) => (v === "" ? null : v);
const check = z.string().optional().transform((s) => s === "on");

export const financialProfileSchema = z.object({
  // 부채 보유 여부(DB 컬럼 아님): 없음이면 숨은 부채 입력칸 값은 버리고 0으로 저장한다
  has_debt: z.preprocess(emptyToNull, z.enum(["yes", "no"])),
  // 목적·시기는 필수(2026-11-19 결정): 빈 폼이 저장돼 "0원까지예요"가 나오던 문제
  purpose: z.preprocess(emptyToNull, z.enum(["live", "invest", "both"])),
  timeline: z.preprocess(emptyToNull, z.enum(["6m", "1y", "2_3y", "undecided"])),
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
})
  .refine((v) => v.has_debt === "no" || v.existing_debt_annual_payment !== null, {
    path: ["existing_debt_annual_payment"], message: "부채가 있으면 연간 원리금 상환액이 필요합니다",
  })
  .transform(({ has_debt, ...v }) => (has_debt === "no" ? { ...v, existing_debt: 0, existing_debt_annual_payment: 0 } : v));

export async function saveFinancialProfile(
  planId: string,
  form: FormData,
): Promise<{ ok: true } | { ok: false; fieldErrors: Record<string, string[]> }> {
  if (!z.uuid().safeParse(planId).success) return { ok: false, fieldErrors: { plan: ["invalid"] } };
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
  // 남의 plan·없는 plan이면 FK/RLS 위반(23503, 42501)
  if (error && ["23503", "42501"].includes(error.code)) return { ok: false, fieldErrors: { plan: ["not_found"] } };
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function getBudgetForPlan(planId: string): Promise<ToolResult> {
  const { createClient } = await import("@/lib/supabase/server"); // server-only: 스키마 테스트가 import할 수 있게 지연 로드
  const supabase = await createClient();
  return getBudget.run({}, { supabase, planId, today: kstToday() });
}
