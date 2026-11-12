// 3단계 조건 점검: must 조건 필터링과 하나씩 빼 보기(leave-one-out)로 충돌을 찾는다. 순수 함수.

export type Priority = "must" | "prefer" | "ignore";
export type ConditionKey = "price_max" | "area" | "approval_year_min" | "household_count_min"
  | "parking_per_household_min" | "floor_area_ratio_max" | "station_distance_max" | "elementary_distance_max";
export interface Conditions {
  housing_types: string[]; price_min: number | null; price_max: number | null;
  area_min: number | null; area_max: number | null; approval_year_min: number | null;
  household_count_min: number | null; parking_per_household_min: number | null;
  floor_area_ratio_max: number | null; mgmt_fee_per_m2_max: number | null;
  station_distance_max_m: number | null; elementary_distance_max_m: number | null;
  rooms_min: number | null; baths_min: number | null; floor_pref: string | null; direction_pref: string | null;
  priorities: Partial<Record<string, Priority>>;
}
export interface ComplexRow {
  complex_id: number; name: string; region_code: string; approval_year: number | null;
  household_count: number | null; parking_per_household: number | null; floor_area_ratio: number | null;
  building_coverage_ratio: number | null; land_share_m2: number | null; median_price: number | null; deal_count: number;
  nearest_station_name: string | null; nearest_station_m: number | null; nearest_elementary_m: number | null;
}
// get_region_prices data.regions 행에서 가져온다. max_budget은 1단계 미저장이면 null
export interface RegionBudget { sigungu_code: string; max_budget: number | null; median_price: number }
export type Conflict =
  | { code: "price_min_over_budget"; budget_max: number }
  | { code: "price_max_over_budget"; budget_max: number }
  | { code: "area_price_mismatch"; sigungu_codes: string[] }
  | { code: "no_match_for_musts"; blocking: ConditionKey[] }
  | { code: "few_matches_for_musts"; count: number };
export type Notice = "no_data_for_type" | "data_unavailable:mgmt_fee" | "unit_level_condition"
  | "no_complex_data" | "truncated" | "land_share_is_average"
  | "location_partial" | "no_poi_data";

const KEYS: ConditionKey[] = ["price_max", "area", "approval_year_min", "household_count_min",
  "parking_per_household_min", "floor_area_ratio_max", "station_distance_max", "elementary_distance_max"];
const DISTANCE: ConditionKey[] = ["station_distance_max", "elementary_distance_max"];
const MAX_MATCHES = 20;
const FEW = 4;

const noLocation = (x: ComplexRow) => x.nearest_station_m === null && x.nearest_elementary_m === null;
// 키별로 모든 행의 거리값이 null이면 그 거리 조건은 판정할 수 없으므로 must·점수에서 뺀다(모든 호출자 공용)
export const noPoiData = (rows: ComplexRow[]) => rows.length > 0 && rows.every(noLocation);
const DISTANCE_VALUE = { station_distance_max: "nearest_station_m", elementary_distance_max: "nearest_elementary_m" } as const;
type DistanceKey = keyof typeof DISTANCE_VALUE;
const absent = (k: DistanceKey, rows: ComplexRow[]) => rows.length > 0 && rows.every((x) => x[DISTANCE_VALUE[k]] === null);
export const activeKeys = (c: Conditions, rows?: ComplexRow[]) =>
  KEYS.filter((k) => isSet(c, k) && !(rows && DISTANCE.includes(k) && absent(k as DistanceKey, rows)));
export const priorityOf = (c: Conditions, k: ConditionKey): Priority => c.priorities[k] ?? "prefer";

const isSet = (c: Conditions, k: ConditionKey) =>
  k === "area" ? c.area_min !== null || c.area_max !== null
    : k === "station_distance_max" ? c.station_distance_max_m !== null
    : k === "elementary_distance_max" ? c.elementary_distance_max_m !== null : c[k] !== null;

// 단지 값이 없으면(null) 충족 여부를 알 수 없으므로 미충족으로 센다
export function meets(c: Conditions, k: ConditionKey, x: ComplexRow): boolean {
  const ge = (v: number | null, min: number | null) => v !== null && v >= min!;
  switch (k) {
    case "price_max": return x.median_price !== null && x.median_price <= c.price_max!;
    case "area": return x.deal_count > 0; // RPC가 면적 범위로 거른 거래 수
    case "approval_year_min": return ge(x.approval_year, c.approval_year_min);
    case "household_count_min": return ge(x.household_count, c.household_count_min);
    case "parking_per_household_min": return ge(x.parking_per_household, c.parking_per_household_min);
    case "floor_area_ratio_max": return x.floor_area_ratio !== null && x.floor_area_ratio <= c.floor_area_ratio_max!;
    case "station_distance_max": return x.nearest_station_m !== null && x.nearest_station_m <= c.station_distance_max_m!;
    case "elementary_distance_max": return x.nearest_elementary_m !== null && x.nearest_elementary_m <= c.elementary_distance_max_m!;
  }
}

export function findConflicts(c: Conditions, budgets: RegionBudget[], complexes: ComplexRow[], truncated: boolean): {
  conflicts: Conflict[]; notices: Notice[];
  counts: { total: number; must: number; prefer: Record<string, number> };
  matches: ComplexRow[];
} {
  const active = activeKeys(c, complexes);
  const musts = active.filter((k) => priorityOf(c, k) === "must");
  const prefers = active.filter((k) => priorityOf(c, k) === "prefer");
  const passes = (keys: ConditionKey[]) => complexes.filter((x) => keys.every((k) => meets(c, k, x)));

  const conflicts: Conflict[] = [];
  const maxBudgets = budgets.map((b) => b.max_budget).filter((v): v is number => v !== null);
  if (maxBudgets.length) {
    const budget_max = Math.max(...maxBudgets);
    if (c.price_min !== null && c.price_min > budget_max) conflicts.push({ code: "price_min_over_budget", budget_max });
    else if (c.price_max !== null && c.price_max > budget_max) conflicts.push({ code: "price_max_over_budget", budget_max });
  }
  if (c.price_max !== null && budgets.length && budgets.every((b) => b.median_price > c.price_max!)) {
    conflicts.push({ code: "area_price_mismatch", sigungu_codes: budgets.map((b) => b.sigungu_code) });
  }

  const matched = passes(musts);
  if (complexes.length && musts.length) {
    if (!matched.length) {
      const blocking = musts.filter((k) => passes(musts.filter((m) => m !== k)).length > 0);
      conflicts.push({ code: "no_match_for_musts", blocking });
    } else if (matched.length <= FEW) {
      conflicts.push({ code: "few_matches_for_musts", count: matched.length });
    }
  }

  const prefer: Record<string, number> = {};
  for (const k of prefers) prefer[k] = matched.filter((x) => meets(c, k, x)).length;

  const matches = [...matched]
    .sort((a, b) => (a.median_price ?? Infinity) - (b.median_price ?? Infinity) || a.complex_id - b.complex_id)
    .slice(0, MAX_MATCHES);

  const notices: Notice[] = [];
  if (c.housing_types.some((t) => t !== "apartment")) notices.push("no_data_for_type");
  if (c.mgmt_fee_per_m2_max !== null) notices.push("data_unavailable:mgmt_fee");
  if (c.rooms_min !== null || c.baths_min !== null || c.floor_pref !== null || c.direction_pref !== null) {
    notices.push("unit_level_condition");
  }
  if (!complexes.length) notices.push("no_complex_data");
  const dist = (DISTANCE as DistanceKey[]).filter((k) => isSet(c, k));
  if (dist.some((k) => absent(k, complexes))) notices.push("no_poi_data");
  if (dist.some((k) => !absent(k, complexes) && complexes.some((x) => x[DISTANCE_VALUE[k]] === null))) notices.push("location_partial");
  if (truncated) notices.push("truncated");
  if (matches.length) notices.push("land_share_is_average");

  return { conflicts, notices, counts: { total: complexes.length, must: matched.length, prefer }, matches };
}
