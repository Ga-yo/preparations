import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@repo/db-types";

export type RegionResult =
  | { status: "ok"; code: string; fullName: string }
  | { status: "ambiguous"; candidates: { code: string; fullName: string }[] }
  | { status: "not_found" };

// 지역 코드는 LLM이 아니라 이 함수가 regions 테이블에서 찾는다.
export async function resolveRegion(supabase: SupabaseClient<Database>, input: string): Promise<RegionResult> {
  // ilike 와일드카드는 지역명에 쓰이지 않으므로 제거
  const name = input.replace(/[%_\\]/g, "").trim().replace(/\s+/g, " ");
  if (!name) return { status: "not_found" };

  const pick = (rows: { code: string; full_name: string }[]): RegionResult => {
    const c = rows.map((r) => ({ code: r.code, fullName: r.full_name }));
    if (c.length === 0) return { status: "not_found" };
    return c.length === 1 ? { status: "ok", code: c[0].code, fullName: c[0].fullName } : { status: "ambiguous", candidates: c };
  };
  const exact = await supabase.from("regions").select("code, full_name").eq("is_active", true).eq("full_name", name).limit(10);
  if (exact.error) throw new Error(exact.error.message);
  if (exact.data.length > 0) return pick(exact.data);

  const suffix = await supabase.from("regions").select("code, full_name").eq("is_active", true).ilike("full_name", `%${name}`).limit(10);
  if (suffix.error) throw new Error(suffix.error.message);
  return pick(suffix.data);
}
