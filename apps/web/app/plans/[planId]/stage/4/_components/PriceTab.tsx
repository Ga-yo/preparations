"use client";

import { useId, useState, type ReactNode } from "react";
import type { LatestChange, MonthPoint } from "@/lib/calc/area-prices";
import { formatWon } from "../../../_components/format";
import { PriceChart } from "./PriceChart";

type Trade = { deal_date: string; deal_amount: number; exclusive_area: number; floor: number | null };
export type AreaPrices = { area: number; label: string; monthly: MonthPoint[]; latest: LatestChange | null; trades: Trade[]; trade_total: number };

const SHOWN = 5;
const ym = (m: string) => `${m.slice(0, 4)}년 ${Number(m.slice(5, 7))}월`;
const pct = (v: number) => `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v).toFixed(1)}%`;
const h3 = "border-t border-chb-line pt-5 font-bold text-chb-ink";
const table = "w-full text-left [&_td]:border-t [&_td]:border-chb-line [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2";

function Rows({ trades }: { trades: Trade[] }) {
  return trades.map((t, i) => (
    <tr key={i}><td>{t.deal_date}</td><td>{formatWon(t.deal_amount)}</td><td>{t.floor ?? "-"}층</td><td>{t.exclusive_area}㎡</td></tr>
  ));
}

function Latest({ series, latest }: { series: MonthPoint[]; latest: LatestChange | null }) {
  const last = series.at(-1)!.month;
  const current = latest?.month === latest?.latest_month;
  return (
    <div className="space-y-1 rounded-2xl bg-chb-soft2 p-4">
      <p className="text-chb-muted">{latest && current ? `${ym(latest.month)} 중위 거래가` : `${ym(latest?.latest_month ?? last)} 거래 없음`}</p>
      {latest && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {current && <span className="font-display text-2xl font-black text-chb-ink">{formatWon(latest.median_price)}</span>}
            {latest.change_pct !== null
              ? <span className="rounded-full bg-chb-line px-2.5 py-1 text-xs font-semibold text-chb-muted">전월 대비 {pct(latest.change_pct)}</span>
              : <span className="rounded-full border border-dashed border-chb-muted/50 px-2.5 py-1 text-xs font-semibold text-chb-muted">전월 거래 없음</span>}
          </div>
          {(!current || latest.change_pct === null) && (
            <p className="text-xs text-chb-muted">
              가장 최근 거래 월 {ym(latest.month)} · 거래 {latest.deal_count}건.
              {latest.change_pct === null && ` ${Number(latest.prev_month.slice(5, 7))}월 거래가 없어 변동률을 계산하지 않아요.`}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function PriceTab({ areas, defaultArea, areaText, tips, neighborsText }: {
  areas: AreaPrices[]; defaultArea: number | null; areaText: string;
  tips: { trades: ReactNode; monthly: ReactNode; neighbors: ReactNode }; neighborsText: string;
}) {
  const [selected, setSelected] = useState(defaultArea ?? areas[0]?.area);
  const [open, setOpen] = useState(false);
  const name = useId();
  const a = areas.find((x) => x.area === selected);
  const rest = a ? a.trades.slice(SHOWN) : [];
  return (
    <>
      {!a ? <p className="text-chb-muted">최근 거래 없음</p> : (
        <>
          <div>
            <div className="max-w-full overflow-x-auto">
              <div role="radiogroup" aria-label="전용면적" className="inline-flex rounded-full border border-chb-line bg-chb-soft2 p-1 text-sm">
                {areas.map((x) => (
                  <label key={x.area} className="shrink-0 cursor-pointer whitespace-nowrap rounded-full px-4 py-1.5 font-semibold text-chb-muted transition has-checked:bg-chb-accent has-checked:text-white has-focus-visible:ring-4 has-focus-visible:ring-chb-accent-soft">
                    <input type="radio" name={name} value={x.area} checked={x.area === selected} onChange={() => { setSelected(x.area); setOpen(false); }} className="sr-only" />{x.label}
                  </label>
                ))}
              </div>
            </div>
            <p className="mt-2 text-xs text-chb-muted">전용면적 기준 · {areaText} 안의 거래만</p>
          </div>
          <Latest series={a.monthly} latest={a.latest} />
          {a.latest && <PriceChart key={a.area} series={a.monthly} />}
          {tips.monthly}

          <h3 className={h3}>{a.trade_total > a.trades.length ? `최근 ${a.trades.length}건 (전체 ${a.trade_total}건)` : `최근 거래 ${open ? a.trades.length : Math.min(SHOWN, a.trades.length)}건`}</h3>
          {a.trades.length ? (
            <div className="overflow-x-auto rounded-2xl border border-chb-line"><table className={table}>
              <thead className="bg-chb-soft2 text-chb-muted"><tr><th scope="col">거래일</th><th scope="col">거래금액</th><th scope="col">층</th><th scope="col">전용면적</th></tr></thead>
              <tbody id={`${name}-rows`}><Rows trades={a.trades.slice(0, SHOWN)} />{open && <Rows trades={rest} />}</tbody>
            </table></div>
          ) : <p className="text-chb-muted">최근 거래 없음</p>}
          {rest.length > 0 && (
            <button type="button" aria-expanded={open} aria-controls={`${name}-rows`} onClick={() => setOpen(!open)}
              className="w-full rounded-full border border-chb-line py-2 font-semibold text-chb-ink transition hover:border-chb-accent hover:text-chb-accent">
              {open ? "접기 ▴" : `전체 거래내역 보기 (${a.trades.length}건) ▾`}
            </button>
          )}
          {tips.trades}
        </>
      )}

      <h3 className={h3}>같은 동 단지와 비교</h3>
      <p>{neighborsText}</p>
      {tips.neighbors}
    </>
  );
}
