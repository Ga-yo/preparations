"use client";

import { useState } from "react";
import type { MonthPoint } from "@/lib/calc/area-prices";
import { formatWon } from "../../../_components/format";
import { chartGeometry, LEFT } from "./price-chart";

const W = 392;
const H = 180;
const eok = (v: number) => `${(v / 1e8).toFixed(1)}억`;

export function PriceChart({ series }: { series: MonthPoint[] }) {
  const g = chartGeometry(series, W, H);
  const [sel, setSel] = useState<number | null>(g.points.at(-1)?.i ?? null);
  const cur = sel === null ? null : series[sel];
  const curPt = g.points.find((p) => p.i === sel);
  return (
    <figure className="space-y-2">
      <div className="flex gap-4 text-xs text-chb-muted">
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-0.5 w-4 bg-chb-accent" />중위가</span>
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-sm bg-chb-accent-soft ring-1 ring-chb-accent/30" />거래 건수</span>
      </div>
      <div className="relative">
        {cur && curPt && (
          <p aria-live="polite" className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-chb-ink px-2 py-1 text-xs font-semibold text-white"
            style={{ left: `${Math.min(85, Math.max(15, (curPt.x / W) * 100))}%` }}>
            {cur.month} · {formatWon(cur.median_price!)} · {cur.deal_count}건
          </p>
        )}
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="최근 12개월 중위가 추이" className="mt-6 w-full overflow-visible">
          {g.yTicks.map((t) => (
            <g key={t.value}>
              <line x1={LEFT} x2={W} y1={t.y} y2={t.y} className="stroke-chb-line" strokeDasharray="2 3" />
              <text x={LEFT - 4} y={t.y + 3} textAnchor="end" className="fill-chb-muted text-[9px]">{eok(t.value)}</text>
            </g>
          ))}
          <line x1={LEFT} x2={W} y1={g.base} y2={g.base} className="stroke-chb-line" />
          {g.bars.map((b) => <rect key={b.i} x={b.x - 6} y={g.base - b.h} width={12} height={b.h} rx={2} className="fill-chb-accent-soft stroke-chb-accent/30" />)}
          {g.segments.map((d) => <path key={d} d={d} fill="none" strokeWidth={2} strokeLinejoin="round" className="stroke-chb-accent" />)}
          {g.points.map((p) => (
            <circle key={p.i} cx={p.x} cy={p.y} r={p.i === sel ? 6 : 4} tabIndex={0} role="button"
              aria-label={`${series[p.i].month} 중위가 ${formatWon(series[p.i].median_price!)}, 거래 ${series[p.i].deal_count}건`} aria-pressed={p.i === sel}
              onClick={() => setSel(p.i)} onFocus={() => setSel(p.i)}
              className={`cursor-pointer stroke-chb-accent outline-none focus-visible:stroke-chb-ink ${p.i === sel ? "fill-chb-accent" : "fill-white"}`} strokeWidth={2} />
          ))}
          {series.map((p, i) => (
            <text key={p.month} x={LEFT + ((i + 0.5) * (W - LEFT)) / series.length} y={H - 6} textAnchor="middle"
              className={`fill-chb-muted text-[9px] ${p.deal_count ? "" : "opacity-45"}`}>{Number(p.month.slice(5))}월</text>
          ))}
        </svg>
      </div>
      <table className="sr-only">
        <caption>최근 12개월 월별 중위가와 거래 건수</caption>
        <thead><tr><th scope="col">월</th><th scope="col">중위가</th><th scope="col">거래 건수</th></tr></thead>
        <tbody>{series.map((p) => (
          <tr key={p.month}><td>{p.month}</td><td>{p.median_price === null ? "거래 없음" : formatWon(p.median_price)}</td><td>{p.deal_count}건</td></tr>
        ))}</tbody>
      </table>
      <figcaption className="text-xs text-chb-muted">거래가 없는 달은 비워 두고 선을 잇지 않아요. 점을 누르면 그 달 중위가와 거래 건수가 보여요.</figcaption>
    </figure>
  );
}
