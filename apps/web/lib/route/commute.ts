import { walkMinutes } from "@/lib/calc/walk";

export type CommuteMode = "transit" | "car";
export type CommuteTarget = { mode: CommuteMode; key: string; label: string };
export type RoutePoints = { from_lon: number; from_lat: number; to_lon: number; to_lat: number };
// 대중교통 경로의 구간(ODsay subPath). 도보 0분 구간은 뺀다
export type Leg =
  | { kind: "walk"; minutes: number }
  | { kind: "subway"; line: string; from: string; to: string; stops: number; minutes: number }
  | { kind: "bus"; busNo: string; busType: number | null; from: string; to: string; stops: number; minutes: number };
export type CommuteResult =
  | { status: "ok"; mode: CommuteMode; minutes: number; transfers: number | null; legs?: Leg[] }
  | { status: "near"; walkMinutes: number }
  | { status: "unavailable" };

const UNAVAILABLE: CommuteResult = { status: "unavailable" };

export function commuteTarget(c: {
  uses_transit: boolean | null;
  commute_station: string | null;
  commute_region_code: string | null;
}): CommuteTarget | null {
  const mode: CommuteMode = c.uses_transit ? "transit" : "car";
  if (c.commute_station) {
    const n = c.commute_station;
    return { mode, key: `station:${n}`, label: n.endsWith("역") ? n : `${n}역` };
  }
  if (c.commute_region_code) return { mode, key: `region:${c.commute_region_code}`, label: "출퇴근 지역" };
  return null;
}

export function commuteText(t: CommuteTarget, r: CommuteResult): string {
  if (r.status === "near") return `가까워서 걸어갈 수 있는 거리예요 (약 도보 ${r.walkMinutes}분)`;
  if (r.status === "unavailable") return "소요시간을 확인하지 못했어요";
  if (r.mode === "car") return `${t.label}까지 자차 ${r.minutes}분 (평일 오전 8시 출발 기준)`;
  return `${t.label}까지 대중교통 ${r.minutes}분 · ${r.transfers === 0 ? "환승 없음" : `환승 ${r.transfers}회`}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export function parseOdsay(json: unknown, straightM: number): CommuteResult {
  const j = json as Json;
  const err = Array.isArray(j?.error) ? j.error[0] : j?.error;
  if (err) return String(err.code) === "-98" ? { status: "near", walkMinutes: walkMinutes(straightM) } : UNAVAILABLE;
  const info = j?.result?.path?.[0]?.info;
  const t = info?.totalTime;
  if (typeof t !== "number") return UNAVAILABLE;
  const boardings = (Number(info.busTransitCount) || 0) + (Number(info.subwayTransitCount) || 0);
  return { status: "ok", mode: "transit", minutes: t, transfers: Math.max(0, boardings - 1), legs: odsayLegs(j.result.path[0].subPath) };
}

function odsayLegs(sub: Json): Leg[] {
  if (!Array.isArray(sub)) return [];
  return sub.flatMap((s: Json): Leg[] => {
    const minutes = Number(s?.sectionTime) || 0;
    const lane = Array.isArray(s?.lane) ? s.lane[0] : undefined;
    const seg = { from: String(s?.startName ?? ""), to: String(s?.endName ?? ""), stops: Number(s?.stationCount) || 0, minutes };
    if (s?.trafficType === 1) return [{ kind: "subway", line: String(lane?.name ?? "지하철"), ...seg }];
    if (s?.trafficType === 2) return [{ kind: "bus", busNo: String(lane?.busNo ?? "버스"), busType: typeof lane?.type === "number" ? lane.type : null, ...seg }];
    return s?.trafficType === 3 && minutes > 0 ? [{ kind: "walk", minutes }] : [];
  });
}

export function parseKakao(json: unknown, straightM: number): CommuteResult {
  const r = (json as Json)?.routes?.[0];
  if (r?.result_code === 104) return { status: "near", walkMinutes: walkMinutes(straightM) };
  const d = r?.summary?.duration;
  if (r?.result_code !== 0 || typeof d !== "number") return UNAVAILABLE;
  return { status: "ok", mode: "car", minutes: Math.round(d / 60), transfers: null };
}

// KST is UTC+9 with no DST; shift and read UTC fields so process TZ is irrelevant.
export function nextWeekday0800Kst(now: Date): string {
  const d = new Date(now.getTime() + 9 * 3600_000);
  do d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}0800`;
}

export function straightMeters(p: RoutePoints): number {
  const r = (x: number) => (x * Math.PI) / 180;
  const h =
    Math.sin(r(p.to_lat - p.from_lat) / 2) ** 2 +
    Math.cos(r(p.from_lat)) * Math.cos(r(p.to_lat)) * Math.sin(r(p.to_lon - p.from_lon) / 2) ** 2;
  return Math.round(2 * 6371008.8 * Math.asin(Math.sqrt(h)));
}

export function cacheKey(t: CommuteTarget, complexId: number): string {
  return `commute:${t.mode}:${t.key}:${complexId}`;
}

export function readCache(key: string): CommuteResult | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(key) ?? "null");
    return v && (v.status === "ok" || v.status === "near") ? (v as CommuteResult) : null;
  } catch {
    return null;
  }
}

export function writeCache(key: string, v: CommuteResult): void {
  if (v.status === "unavailable") return; // may be transient; retry on reopen
  try {
    sessionStorage.setItem(key, JSON.stringify(v));
  } catch {}
}
