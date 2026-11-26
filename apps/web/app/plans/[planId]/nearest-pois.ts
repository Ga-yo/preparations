import type { NearestPoi } from "./_components/Nearest";

// 4단계 상세·5단계 비교표용: 단지별 역·초·중·고 최근접(동점 확인용)과 1km 안 개수
export async function nearestPois(ids: number[]): Promise<Record<number, NearestPoi[]>> {
  if (!ids.length) return {};
  const supabase = await (await import("@/lib/supabase/server")).createClient(); // server-only: 테스트가 import할 수 있게 지연 로드
  const { data, error } = await supabase.rpc("complex_nearest_pois", { p_complex_ids: ids });
  if (error) throw new Error(error.message);
  const out: Record<number, NearestPoi[]> = {};
  for (const { complex_id, ...r } of data ?? []) (out[complex_id] ??= []).push(r);
  return out;
}
