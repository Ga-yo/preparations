import { formatWon } from "../../../_components/format";

// 3단계 폼에서 우선순위를 고를 수 있는 조건과 그 값을 읽어 오는 입력칸. area는 2단계 값이라 폼에 없다. 진행 막대(StageProgress)가 쓴다
export const STAGE3_KEYS: { key: string; field?: string; text: (v: number) => string }[] = [
  { key: "price_max", text: (v) => `최고가 ${formatWon(v * 10_000)} 이하` },
  { key: "area", text: () => "" },
  { key: "approval_year_min", text: (v) => `${v}년 이후 준공` },
  { key: "household_count_min", text: (v) => `${v.toLocaleString("ko-KR")}세대 이상` },
  { key: "parking_per_household_min", text: (v) => `세대당 주차 ${v}대 이상` },
  { key: "floor_area_ratio_max", text: (v) => `용적률 ${v}% 이하` },
  { key: "station_distance_max", field: "station_distance_max_m", text: (v) => `역 ${v.toLocaleString("ko-KR")}m 이내` },
  { key: "elementary_distance_max", field: "elementary_distance_max_m", text: (v) => `초등학교 ${v.toLocaleString("ko-KR")}m 이내` },
];
const TYPES: Record<string, string> = { apartment: "아파트", officetel: "오피스텔", row_house: "연립·다세대" };
const FLOORS: Record<string, string> = { low: "저층", mid: "중층", high: "고층" };
const DIRECTIONS: Record<string, string> = { east: "동향", west: "서향", south: "남향", north: "북향" };

type Cond = { text: string; priority: string };
export type Stage3Snapshot = { conds: Cond[]; basics: string[] };

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").replace(/,/g, "").trim();
  return s ? Number(s) : null;
};
// areaText: 2단계에서 정한 면적(없으면 null). 값이 있는 조건만 센다(저장할 때도 값 없는 조건의 우선순위는 버린다)
export function readStage3(form: HTMLFormElement, areaText: string | null): Stage3Snapshot {
  const f = new FormData(form);
  const conds: Cond[] = [];
  for (const k of STAGE3_KEYS) {
    const priority = String(f.get(`priority.${k.key}`) ?? "prefer");
    if (k.key === "area") { if (areaText) conds.push({ text: areaText, priority }); continue; }
    const v = num(f.get(k.field ?? k.key));
    if (v !== null) conds.push({ text: k.text(v), priority });
  }
  const rooms = num(f.get("rooms_min")), baths = num(f.get("baths_min"));
  const basics = [
    ...f.getAll("housing_types").map((t) => TYPES[String(t)] ?? String(t)),
    rooms !== null && `방 ${rooms}개 이상`, baths !== null && `욕실 ${baths}개 이상`,
    FLOORS[String(f.get("floor_pref") ?? "")], DIRECTIONS[String(f.get("direction_pref") ?? "")],
    f.has("redevelopment_interest") && "재건축·재개발 관심",
  ].filter(Boolean) as string[];
  return { conds, basics };
}
