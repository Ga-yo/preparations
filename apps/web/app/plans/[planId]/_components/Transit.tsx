import type { Leg } from "@/lib/route/commute";
import { busColor, lineColor, lineLabel } from "@/lib/route/lines";

// 상태 없는 표시 컴포넌트라 서버·클라이언트 어디서나 쓴다
const icon = "size-3.5 shrink-0";
export const SubwayIcon = () => (
  <svg viewBox="0 0 24 24" className={icon} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="3" width="14" height="14" rx="3" /><path d="M5 11h14M9 21l1.5-4M15 21l-1.5-4" /><circle cx="9" cy="14" r=".6" fill="currentColor" /><circle cx="15" cy="14" r=".6" fill="currentColor" />
  </svg>
);
export const BusIcon = () => (
  <svg viewBox="0 0 24 24" className={icon} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="3" width="16" height="15" rx="3" /><path d="M4 11h16M7 18v3M17 18v3" /><circle cx="8" cy="14.5" r=".6" fill="currentColor" /><circle cx="16" cy="14.5" r=".6" fill="currentColor" />
  </svg>
);
const WalkIcon = () => (
  <svg viewBox="0 0 24 24" className={icon} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="13" cy="4" r="1.6" /><path d="M10 21l2-6 3 3v3M9 12l2-4 4 2 2 3M11 8l-2 5" />
  </svg>
);

const badge = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold text-white whitespace-nowrap";

export function LineBadge({ line }: { line: string }) {
  return <span className={badge} style={{ backgroundColor: lineColor(line) }}><SubwayIcon />{lineLabel(line)}</span>;
}

// 역 이름 앞에 노선 배지(환승역은 노선마다). 다른 시설 이름과 헷갈리지 않게 강조한다
export function StationName({ name, lines }: { name: string; lines: string[] | null }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {(lines ?? []).map((l) => <LineBadge key={l} line={l} />)}
      <span className="font-semibold">{name.endsWith("역") ? name : `${name}역`}</span>
    </span>
  );
}

export function RouteLegs({ legs }: { legs: Leg[] }) {
  if (!legs.length) return null;
  return (
    <ol aria-label="가는 길" className="mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-1.5 text-xs text-chb-muted">
      {legs.map((g, i) => (
        <li key={i} className="inline-flex items-center gap-1">
          {i > 0 && <span aria-hidden="true">›</span>}
          {g.kind === "walk" ? <span className="inline-flex items-center gap-0.5"><WalkIcon />도보 {g.minutes}분</span>
            : g.kind === "subway" ? <><LineBadge line={g.line} /><span className="text-chb-ink">{g.from}→{g.to}</span> {g.stops}정거장 {g.minutes}분</>
            : <><span className={badge} style={{ backgroundColor: busColor(g.busType) }}><BusIcon />{g.busNo}</span><span className="text-chb-ink">{g.from}→{g.to}</span> {g.stops}정거장 {g.minutes}분</>}
        </li>
      ))}
    </ol>
  );
}
