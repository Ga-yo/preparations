import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@repo/db-types";
import { z } from "zod";
import { kstToday } from "@/lib/agent/orchestrator";
import { resolveRegion } from "@/lib/agent/region";
import type { ToolResult } from "@/lib/agent/tool";
import { getRegionPrices } from "@/lib/agent/tools/get-region-prices";

// 빈 문자열은 null, 아니면 범위 안의 숫자
const num = (min: number, max: number, int = true) =>
  z
    .string()
    .optional()
    .transform((s) => (s?.trim() ? Number(s) : null))
    .pipe((int ? z.number().int() : z.number()).min(min).max(max).nullable());
const check = z.string().optional().transform((s) => s === "on");
const text = (max: number) =>
  z.string().max(max).optional().transform((s) => (s?.trim() ? s.trim() : null));

export const stage2Schema = z
  .object({
    sigungu_codes: z.array(z.string().regex(/^\d{5}$/)).max(10).default([]),
    dong_names: z
      .string()
      .optional()
      .transform((s) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean))
      .pipe(z.array(z.string().max(50)).max(5)),
    commute_region_name: text(50),
    commute_minutes_max: num(10, 180),
    uses_transit: check,
    parking_required: check,
    school_importance: num(1, 5),
    infra_importance: num(1, 5),
    household_size: num(1, 20),
    rooms_min: num(1, 10),
    area_min: num(10, 300, false),
    area_max: num(10, 300, false),
    environment_prefs: z.array(z.enum(["quiet", "near_commercial", "near_park"])).default([]),
    region_reason: text(200),
  })
  .refine((v) => v.area_min === null || v.area_max === null || v.area_min <= v.area_max, {
    path: ["area_max"],
    message: "area_min <= area_max",
  });

type FieldErrors = Record<string, string[]>;

// 체크박스 코드는 capital_sigungu에 있는 것만, 이름은 resolveRegion으로 정확히 한 곳일 때만 코드로 바꾼다
export async function resolveStage2Regions(
  supabase: SupabaseClient<Database>,
  v: { sigungu_codes: string[]; dong_names: string[]; commute_region_name: string | null },
): Promise<{ ok: true; region_codes: string[]; commute_region_code: string | null } | { ok: false; fieldErrors: FieldErrors }> {
  const fieldErrors: FieldErrors = {};
  if (v.sigungu_codes.length) {
    const { data, error } = await supabase.from("capital_sigungu").select("sigungu_code").in("sigungu_code", v.sigungu_codes);
    if (error) throw new Error(error.message);
    const known = new Set((data ?? []).map((r) => r.sigungu_code));
    if (v.sigungu_codes.some((c) => !known.has(c))) fieldErrors.sigungu_codes = ["unknown"];
  }
  const dongCodes: string[] = [];
  for (const name of v.dong_names) {
    const r = await resolveRegion(supabase, name);
    if (r.status === "ok") dongCodes.push(r.code);
    else fieldErrors.dong_names = [r.status];
  }
  let commute: string | null = null;
  if (v.commute_region_name) {
    const r = await resolveRegion(supabase, v.commute_region_name);
    if (r.status === "ok") commute = r.code;
    else fieldErrors.commute_region_name = [r.status];
  }
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  const region_codes = [...new Set([...v.sigungu_codes.map((c) => `${c}00000`), ...dongCodes])];
  return { ok: true, region_codes, commute_region_code: commute };
}

export async function saveStage2Conditions(
  planId: string,
  form: FormData,
): Promise<{ ok: true } | { ok: false; fieldErrors: FieldErrors }> {
  if (!z.uuid().safeParse(planId).success) return { ok: false, fieldErrors: { plan: ["invalid"] } };
  // 여러 값 필드는 Object.fromEntries가 마지막 하나만 남긴다
  const parsed = stage2Schema.safeParse({
    ...Object.fromEntries(form),
    sigungu_codes: form.getAll("sigungu_codes"),
    environment_prefs: form.getAll("environment_prefs"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: z.flattenError(parsed.error).fieldErrors as FieldErrors };
  const { createClient } = await import("@/lib/supabase/server"); // server-only: 스키마 테스트가 import할 수 있게 지연 로드
  const supabase = await createClient();
  const { sigungu_codes, dong_names, commute_region_name, ...values } = parsed.data;
  const regions = await resolveStage2Regions(supabase, { sigungu_codes, dong_names, commute_region_name });
  if (!regions.ok) return regions;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");
  // condition_sets는 append-only: 최신 행(3단계 값 포함)을 복사하고 2단계 값만 덮어 새 행으로 넣는다
  const { data: latest, error: readError } = await supabase
    .from("condition_sets").select("*").eq("plan_id", planId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (readError) throw new Error(readError.message);
  const { id: _id, created_at: _created, ...prev } = latest ?? { id: null, created_at: null };
  void _id; void _created;
  const { error } = await supabase.from("condition_sets").insert({
    ...prev,
    ...values,
    region_codes: regions.region_codes,
    commute_region_code: regions.commute_region_code,
    plan_id: planId,
    user_id: user.id,
  });
  if (error && ["23503", "42501"].includes(error.code)) return { ok: false, fieldErrors: { plan: ["not_found"] } };
  if (error) throw new Error(error.message);
  const { error: stageError } = await supabase.from("plans").update({ current_stage: 2 }).eq("id", planId).lt("current_stage", 2);
  if (stageError) throw new Error(stageError.message);
  return { ok: true };
}

export async function getRegionPricesForPlan(planId: string): Promise<ToolResult> {
  const { createClient } = await import("@/lib/supabase/server"); // server-only: 스키마 테스트가 import할 수 있게 지연 로드
  const supabase = await createClient();
  return getRegionPrices.run({}, { supabase, planId, today: kstToday() });
}
