import { nearestTies, placeText } from "./format";
import { StationName } from "./Transit";

export type NearestPoi = { category: string; name: string; lines: string[] | null; distance_m: number; within_1km: number };
export const NEAREST_LABELS: [string, string][] = [
  ["subway_station", "지하철역"], ["elementary_school", "초등학교"], ["middle_school", "중학교"], ["high_school", "고등학교"],
];

// 한 종류(예: 초등학교)의 가장 가까운 곳. 도보 분이 같으면 함께, 1km 안 나머지는 "외 n개"
export function NearestPlaces({ rows }: { rows: NearestPoi[] }) {
  const { shown, more } = nearestTies(rows, rows[0]?.within_1km ?? 0);
  if (!shown.length) return <span className="text-chb-muted">-</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      {shown.map((r) => (
        <span key={r.name} className="inline-flex flex-wrap items-center gap-1">
          {r.category === "subway_station" ? <><StationName name={r.name} lines={r.lines} />{placeText("", r.distance_m)}</> : placeText(r.name, r.distance_m)}
        </span>
      ))}
      {more > 0 && <span className="text-chb-muted">외 {more}개</span>}
    </span>
  );
}
