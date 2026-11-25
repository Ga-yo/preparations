"use server";

import { z } from "zod";
import { nextWeekday0800Kst, parseKakao, straightMeters, type CommuteResult, type RoutePoints } from "@/lib/route/commute";

const UNAVAILABLE: CommuteResult = { status: "unavailable" };

// 최신 조건 세트의 출퇴근지로 단지↔출퇴근지 좌표를 구한다. 없거나 남의 계획이면 null.
export async function commutePoints(planId: string, complexId: number): Promise<RoutePoints | null> {
  if (!z.uuid().safeParse(planId).success || !z.number().int().positive().safeParse(complexId).success) return null;
  const { createClient } = await import("@/lib/supabase/server"); // server-only: 테스트가 import할 수 있게 지연 로드
  const supabase = await createClient();
  const { data: set, error: setErr } = await supabase.from("condition_sets")
    .select("commute_station, commute_region_code").eq("plan_id", planId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (setErr) { console.error("commute_points_failed", setErr.code); return null; }
  if (!set || (!set.commute_station && !set.commute_region_code)) return null;
  const { data, error } = await supabase.rpc("route_points", set.commute_station
    ? { p_complex_id: complexId, commute_station: set.commute_station }
    : { p_complex_id: complexId, commute_code: set.commute_region_code! });
  if (error) { console.error("commute_points_failed", error.code); return null; }
  return data?.[0] ?? null;
}

// shortcut: 사용자별 하루 호출 상한 없음, 무료 쿼터 소진이 보이면 chat_usage처럼 카운터 테이블 추가
export async function carCommute(planId: string, complexId: number): Promise<CommuteResult> {
  const key = process.env.KAKAO_MOBILITY_REST_KEY;
  if (!key) return UNAVAILABLE;
  const p = await commutePoints(planId, complexId);
  if (!p) return UNAVAILABLE;
  const url = `https://apis-navi.kakaomobility.com/v1/future/directions?origin=${p.from_lon},${p.from_lat}`
    + `&destination=${p.to_lon},${p.to_lat}&departure_time=${nextWeekday0800Kst(new Date())}&summary=true`;
  try {
    const res = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` }, signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!res.ok) { console.error("kakao_route_failed", res.status); return UNAVAILABLE; }
    return parseKakao(await res.json(), straightMeters(p));
  } catch (e) {
    console.error("kakao_route_failed", e instanceof Error ? e.name : "unknown");
    return UNAVAILABLE;
  }
}
