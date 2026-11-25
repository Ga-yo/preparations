import { commuteTarget, type CommuteTarget } from "@/lib/route/commute";

// 비교표 출퇴근 줄용: 최신 조건 세트의 출퇴근지만 읽는다(비교 툴이 읽는 세트와 같다)
export async function commuteForPlan(planId: string): Promise<CommuteTarget | null> {
  const { data, error } = await (await (await import("@/lib/supabase/server")).createClient()).from("condition_sets")
    .select("uses_transit, commute_station, commute_region_code").eq("plan_id", planId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? commuteTarget(data) : null;
}
