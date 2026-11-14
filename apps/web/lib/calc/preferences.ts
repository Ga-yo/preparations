// 2단계 생활 조건과 1단계 목적·시기를 결과에 반영한다. 기준값을 새로 만들지 않고 가중치·정렬·안내로만 쓴다 (M6-D3). 순수 함수.
import type { ComplexRow, ConditionKey, Conditions } from "./conditions";

export interface LifePrefs {
  uses_transit: boolean | null; school_importance: number | null; infra_importance: number | null;
  environment_prefs: string[]; parking_required: boolean | null;
}
export type TieBreaker = { field: "nearest_station_m" | "nearest_elementary_m" | "shop_count_500m" | "nearest_park_m"; dir: 1 | -1 };

const HIGH = 4; // 중요도 1~5 중 4·5를 "중요"로 본다
const high = (v: number | null) => v !== null && v >= HIGH;
const wantsShops = (p: LifePrefs) => high(p.infra_importance) || p.environment_prefs.includes("near_commercial");

export function weightsFor(p: LifePrefs): Partial<Record<ConditionKey, number>> {
  return { ...(p.uses_transit && { station_distance_max: 2 }), ...(high(p.school_importance) && { elementary_distance_max: 2 }) };
}

// 같은 적합도 점수 안에서 쓰는 정렬 기준 (1 = 작을수록 좋음, -1 = 클수록 좋음)
export function tieBreakers(p: LifePrefs): TieBreaker[] {
  const t: TieBreaker[] = [];
  if (p.uses_transit) t.push({ field: "nearest_station_m", dir: 1 });
  if (high(p.school_importance)) t.push({ field: "nearest_elementary_m", dir: 1 });
  if (wantsShops(p)) t.push({ field: "shop_count_500m", dir: -1 });
  if (p.environment_prefs.includes("near_park")) t.push({ field: "nearest_park_m", dir: 1 });
  return t;
}

// 2단계 "주차 필요"는 3단계 주차 조건이 비어 있을 때 세대당 1대 이상으로 본다
export function applyParkingDefault(c: Conditions, p: LifePrefs): Conditions {
  return p.parking_required && c.parking_per_household_min === null ? { ...c, parking_per_household_min: 1 } : c;
}

export function lifeNotices(p: LifePrefs, rows: ComplexRow[]): string[] {
  const none = (k: "nearest_park_m" | "shop_count_500m") => rows.every((x) => x[k] === null);
  return [
    ...(p.environment_prefs.includes("quiet") ? ["quiet_no_data"] : []),
    ...(p.environment_prefs.includes("near_park") && none("nearest_park_m") ? ["no_park_data"] : []),
    ...(wantsShops(p) && none("shop_count_500m") ? ["no_shop_data"] : []),
  ];
}

export function profileNotices(p: { purpose: string | null; timeline: string | null }): string[] {
  return [
    ...(p.purpose === "invest" || p.purpose === "both" ? ["invest_not_supported"] : []),
    ...(p.timeline === "2_3y" || p.timeline === "undecided" ? ["recheck_regulation"] : []),
  ];
}
