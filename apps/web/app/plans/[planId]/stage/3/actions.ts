import { z } from "zod";
import { kstToday } from "@/lib/agent/orchestrator";
import type { ToolResult } from "@/lib/agent/tool";
import { checkConditions } from "@/lib/agent/tools/check-conditions";
import type { ConditionKey } from "@/lib/calc/conditions";

// 빈 문자열은 null, 아니면 범위 안의 숫자 (2단계와 같은 규칙)
const num = (min: number, max: number, int = true) =>
  z
    .string()
    .optional()
    .transform((s) => (s?.trim() ? Number(s) : null))
    .pipe((int ? z.number().int() : z.number()).min(min).max(max).nullable());
// 만원 입력 → 원 (1단계와 같은 규칙)
const won = num(0, 1e9).transform((n) => (n === null ? null : n * 10_000));
const check = z.string().optional().transform((s) => s === "on");
const text = (max: number) =>
  z.string().max(max).optional().transform((s) => (s?.trim() ? s.trim() : null));

export const PRIORITY_KEYS: ConditionKey[] = ["price_max", "area", "approval_year_min", "household_count_min",
  "parking_per_household_min", "floor_area_ratio_max"];
const priority = z.enum(["must", "prefer", "ignore"]).optional();

export const stage3Schema = z
  .object({
    housing_types: z.array(z.enum(["apartment", "officetel", "row_house"])).default([]),
    price_min: won,
    price_max: won,
    area_min: num(10, 300, false),
    area_max: num(10, 300, false),
    rooms_min: num(1, 10),
    baths_min: num(1, 5),
    floor_pref: z.enum(["low", "mid", "high", ""]).optional().transform((s) => (s ? s : null)),
    direction_pref: text(20),
    approval_year_min: num(1950, 2030),
    household_count_min: num(1, 10000),
    parking_per_household_min: num(0, 5, false),
    mgmt_fee_per_m2_max: num(0, 100000),
    floor_area_ratio_max: num(0, 2000, false),
    redevelopment_interest: check,
    ...Object.fromEntries(PRIORITY_KEYS.map((k) => [`priority.${k}`, priority])),
  })
  .refine((v) => v.price_min === null || v.price_max === null || v.price_min <= v.price_max, {
    path: ["price_max"], message: "price_min <= price_max",
  })
  .refine((v) => v.area_min === null || v.area_max === null || v.area_min <= v.area_max, {
    path: ["area_max"], message: "area_min <= area_max",
  })
  .transform((v) => {
    const out: Record<string, unknown> = {};
    const priorities: Record<string, string> = {};
    for (const [k, val] of Object.entries(v)) {
      if (!k.startsWith("priority.")) { out[k] = val; continue; }
      const key = k.slice("priority.".length) as ConditionKey;
      const isSet = key === "area" ? v.area_min !== null || v.area_max !== null : v[key] !== null;
      if (val && isSet) priorities[key] = val as string; // 값이 없는 조건의 우선순위는 의미가 없다
    }
    return { ...(out as Omit<typeof v, `priority.${string}`>), priorities };
  });
export type Stage3Values = z.output<typeof stage3Schema>;

type FieldErrors = Record<string, string[]>;

// condition_sets는 append-only: 최신 행(2단계 값 포함)을 복사하고 3단계 값만 덮는다
export function stage3Row<T extends { id?: unknown; created_at?: unknown }>(latest: T | null, values: Stage3Values, planId: string, userId: string) {
  const { id: _id, created_at: _created, ...prev } = latest ?? {};
  void _id; void _created;
  return { ...prev, ...values, plan_id: planId, user_id: userId };
}

export async function saveStage3Conditions(
  planId: string,
  form: FormData,
): Promise<{ ok: true } | { ok: false; fieldErrors: FieldErrors }> {
  if (!z.uuid().safeParse(planId).success) return { ok: false, fieldErrors: { plan: ["invalid"] } };
  // 여러 값 필드는 Object.fromEntries가 마지막 하나만 남긴다
  const parsed = stage3Schema.safeParse({ ...Object.fromEntries(form), housing_types: form.getAll("housing_types") });
  if (!parsed.success) return { ok: false, fieldErrors: z.flattenError(parsed.error).fieldErrors as FieldErrors };
  const { createClient } = await import("@/lib/supabase/server"); // server-only: 스키마 테스트가 import할 수 있게 지연 로드
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");
  const { data: latest, error: readError } = await supabase
    .from("condition_sets").select("*").eq("plan_id", planId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (readError) throw new Error(readError.message);
  const { error } = await supabase.from("condition_sets").insert(stage3Row(latest, parsed.data, planId, user.id));
  if (error && ["23503", "42501"].includes(error.code)) return { ok: false, fieldErrors: { plan: ["not_found"] } };
  if (error) throw new Error(error.message);
  const { error: stageError } = await supabase.from("plans").update({ current_stage: 3 }).eq("id", planId).lt("current_stage", 3);
  if (stageError) throw new Error(stageError.message);
  return { ok: true };
}

export async function checkConditionsForPlan(planId: string): Promise<ToolResult> {
  const { createClient } = await import("@/lib/supabase/server"); // server-only: 스키마 테스트가 import할 수 있게 지연 로드
  const supabase = await createClient();
  return checkConditions.run({}, { supabase, planId, today: kstToday() });
}
