import type { MonthPoint } from "@/lib/calc/area-prices";

// viewBox 좌표: 왼쪽 축 36, 선 영역 위 10·아래 118, 막대 기준선 = 높이 - 20(x축 라벨 자리)
export const LEFT = 36;
const TOP = 10;
const BOTTOM = 118;
const BAR_MAX = 30;
const BAR_MIN = 4;
const STEP = 50_000_000;

export function chartGeometry(series: MonthPoint[], width: number, height: number) {
  const xOf = (i: number) => LEFT + ((i + 0.5) * (width - LEFT)) / series.length;
  const vals = series.flatMap((p) => (p.median_price === null ? [] : [p.median_price]));
  const min = Math.min(...vals), max = Math.max(...vals);
  const lo = vals.length ? (min === max ? min - STEP : Math.floor(min / STEP) * STEP) : 0;
  const hi = vals.length ? (min === max ? max + STEP : Math.ceil(max / STEP) * STEP) : STEP;
  const yOf = (v: number) => BOTTOM - ((v - lo) / (hi - lo)) * (BOTTOM - TOP);

  const points = series.flatMap((p, i) => (p.median_price === null ? [] : [{ i, x: xOf(i), y: yOf(p.median_price) }]));
  const segments: string[] = [];
  let run: typeof points = [];
  const flush = () => { if (run.length > 1) segments.push(run.map((p, k) => `${k ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")); run = []; };
  for (const p of points) { if (run.length && run[run.length - 1].i !== p.i - 1) flush(); run.push(p); }
  flush();

  const maxCount = Math.max(0, ...series.map((p) => p.deal_count));
  const bars = series.flatMap((p, i) => (p.deal_count > 0 ? [{ i, x: xOf(i), h: Math.max(BAR_MIN, (p.deal_count / maxCount) * BAR_MAX) }] : []));
  const yTicks = vals.length ? [lo, (lo + hi) / 2, hi].map((value) => ({ value, y: yOf(value) })) : [];
  return { points, segments, yTicks, bars, base: height - 20 };
}
