// 단지별 정비사업 정보(M5-D10, D11). 배치로 적재한 redevelopment_projects만 읽는다(원칙 3).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@repo/db-types";

export type RedevelopmentProject = { name: string; project_type: string; stage: string; stage_date: string | null };
export type RedevelopmentInfo =
  | { status: "not_covered" }
  | { status: "none"; dong_zone_count: 0 }
  | { status: "in_zone"; project: RedevelopmentProject; dong_zone_count: number }
  | { status: "near"; dong_zone_count: number };

export const COVERED_SIDO = ["11"]; // 서울만 적재(OA-22856)
const DATASET = "redevelopment:seoul";
const STAGE_ORDER = ["정비구역지정", "추진위", "조합설립", "건축심의", "사업시행인가", "관리처분인가", "착공"];

export async function loadRedevelopment(
  supabase: SupabaseClient<Database>, complexes: { id: number; region_code: string }[],
): Promise<{ byId: Record<number, RedevelopmentInfo>; as_of: Record<string, string> }> {
  const covered = complexes.filter((c) => COVERED_SIDO.includes(c.region_code.slice(0, 2)));
  const byId: Record<number, RedevelopmentInfo> = Object.fromEntries(
    complexes.filter((c) => !covered.includes(c)).map((c) => [c.id, { status: "not_covered" }]));
  if (!covered.length) return { byId, as_of: {} };

  const cols = "complex_id, region_code, name, project_type, stage, stage_date";
  const [own, dong, fresh] = await Promise.all([
    supabase.from("redevelopment_projects").select(cols).in("complex_id", covered.map((c) => c.id)),
    supabase.from("redevelopment_projects").select(cols).in("region_code", [...new Set(covered.map((c) => c.region_code))]),
    supabase.from("data_freshness").select("dataset, as_of").eq("dataset", DATASET),
  ]);
  for (const r of [own, dong, fresh]) if (r.error) throw new Error(r.error.message);

  for (const c of covered) {
    const count = (dong.data ?? []).filter((p) => p.region_code === c.region_code).length;
    // 한 단지에 구역이 둘 이상이면 가장 진행된 단계를 보여준다
    const p = (own.data ?? []).filter((x) => x.complex_id === c.id)
      .sort((a, b) => STAGE_ORDER.indexOf(b.stage) - STAGE_ORDER.indexOf(a.stage))[0];
    byId[c.id] = p
      ? { status: "in_zone", project: { name: p.name, project_type: p.project_type, stage: p.stage, stage_date: p.stage_date }, dong_zone_count: count }
      : count ? { status: "near", dong_zone_count: count } : { status: "none", dong_zone_count: 0 };
  }
  return { byId, as_of: Object.fromEntries((fresh.data ?? []).map((f) => [f.dataset, f.as_of])) };
}
