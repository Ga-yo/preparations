// 면적별 월 시계열과 전월 대비(원칙 1). 날짜는 KST "YYYY-MM-DD"/"YYYY-MM" 문자열로만 다룬다.

export type MonthPoint = { month: string; median_price: number | null; deal_count: number };
export type LatestChange = {
  latest_month: string; month: string; median_price: number; deal_count: number;
  prev_month: string; prev_median: number | null; prev_count: number; change_pct: number | null;
};

const shift = (ym: string, by: number) => {
  const n = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + by;
  return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;
};

export function monthKeys(today: string, n: number): string[] {
  const cur = today.slice(0, 7);
  return Array.from({ length: n }, (_, i) => shift(cur, i - n + 1));
}

export function monthlySeries(rows: { month: string; median_price: number; deal_count: number }[], keys: string[]): MonthPoint[] {
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return keys.map((month) => {
    const r = byMonth.get(month);
    return r ? { month, median_price: r.median_price, deal_count: r.deal_count } : { month, median_price: null, deal_count: 0 };
  });
}

export function latestMonthChange(series: MonthPoint[]): LatestChange | null {
  const i = series.findLastIndex((p) => p.median_price !== null);
  if (i < 0) return null;
  const cur = series[i];
  const prev_month = shift(cur.month, -1);
  const prev = series.find((p) => p.month === prev_month);
  const prev_median = prev?.median_price ?? null;
  return {
    latest_month: series[series.length - 1].month, month: cur.month, median_price: cur.median_price!, deal_count: cur.deal_count,
    prev_month, prev_median, prev_count: prev?.deal_count ?? 0,
    change_pct: prev_median ? Math.round(((cur.median_price! - prev_median) / prev_median) * 1000) / 10 + 0 : null, // + 0: -0을 0으로
  };
}

export function defaultArea(groups: { area: number; deal_count: number }[]): number | null {
  if (!groups.length) return null;
  return groups.reduce((a, b) => (b.deal_count > a.deal_count || (b.deal_count === a.deal_count && b.area < a.area) ? b : a)).area;
}
