import { Fragment } from "react";
import Link from "next/link";
import type { RedevelopmentInfo } from "@/lib/agent/redevelopment";
import type { CompareItem, CompareResult, Metric } from "@/lib/calc/compare";
import type { ComplexRow } from "@/lib/calc/conditions";
import { CONDITION_LABELS } from "../../../_components/ConditionCheckCard";
import { walkMinutes } from "@/lib/calc/walk";
import type { CommuteTarget } from "@/lib/route/commute";
import { Commute } from "../../../_components/Commute";
import { formatWon } from "../../../_components/format";
import { redevelopmentText } from "../../../_components/redevelopment";
import { TipPanel, type Tip } from "../../../_components/TipPanel";

type Costs = { acquisitionTax: number; brokerage: number; total: number; heavy_tax: boolean };
type Item = CompareItem & { redevelopment?: RedevelopmentInfo; costs?: Costs | null };
export type CompareData = Omit<CompareResult, "items"> & { items: Item[]; rows: ComplexRow[]; criteria: { months: number; area_min: number | null; area_max: number | null } };

export const RISK_LABELS: Record<string, string> = {
  over_budget: "예산 초과", budget_unknown: "예산 판단 불가(1단계 미저장)", few_trades: "거래 적음(1~2건)",
  no_recent_trades: "최근 거래 없음", old_building: "사용승인 30년 이상", no_location: "위치 정보 없음",
  outside_conditions: "현재 조건 밖", redevelopment_in_zone: "정비구역 안",
};
const label = (k: string) => CONDITION_LABELS[k] ?? k;
const num = (v: number | null, unit = "") => (v === null ? "-" : `${v.toLocaleString("ko-KR")}${unit}`);

type Line = { key: string; group?: string; title: string; metric?: Metric; cell: (r: ComplexRow, i: Item) => React.ReactNode };

// commute: 5단계 화면만 넘긴다(저장된 리포트는 실시간 길찾기를 부르지 않도록 안 넘김)
export function CompareTable({ planId, data, tips, commute }: { planId: string; data: CompareData; tips: Tip[]; commute?: CommuteTarget | null }) {
  const byId = new Map(data.rows.map((r) => [r.complex_id, r]));
  const lines: Line[] = [
    { key: "price", group: "가격·비용", title: `최근 ${data.criteria.months}개월 중위가`, metric: "median_price", cell: (r) => (r.median_price === null ? "최근 거래 없음" : formatWon(r.median_price)) },
    { key: "gap", title: "최저가 단지와 차이", cell: (_, i) => (i.price_gap_from_min === null ? "-" : i.price_gap_from_min === 0 ? "최저" : `+${formatWon(i.price_gap_from_min)}`) },
    { key: "ratio", title: "예산 대비", cell: (_, i) => (i.budget_ratio === null ? "-" : `${Math.round(i.budget_ratio * 100)}%`) },
    { key: "costs", title: "부대비용(중위가 기준)", cell: (_, i) => (i.costs ? <Costs c={i.costs} /> : "-") },
    { key: "deals", title: "거래 건수", cell: (r) => `${r.deal_count}건` },
    { key: "fit", group: "조건 적합도", title: "적합도", metric: "fit_score", cell: (_, i) => (i.fit ? `${i.fit.score}점` : "현재 조건 밖") },
    { key: "met", title: "조건 충족", cell: (_, i) => (i.fit ? <Chips met={i.fit.met} unmet={i.fit.unmet} missing={i.fit.missing} /> : "-") },
    { key: "year", group: "단지", title: "사용승인 연도", metric: "approval_year", cell: (r) => (r.approval_year === null ? "-" : `${r.approval_year}년`) },
    { key: "hh", title: "세대수", metric: "household_count", cell: (r) => num(r.household_count, "세대") },
    { key: "parking", title: "세대당 주차", metric: "parking_per_household", cell: (r) => num(r.parking_per_household, "대") },
    { key: "far", title: "용적률", cell: (r) => num(r.floor_area_ratio, "%") },
    { key: "land", title: "대지지분(평균 근사)", metric: "land_share_m2", cell: (r) => num(r.land_share_m2, "㎡") },
    { key: "station", group: "입지", title: "가까운 역", metric: "nearest_station_m", cell: (r) => (r.nearest_station_m === null ? "-" : `${r.nearest_station_name ?? ""} 약 도보 ${walkMinutes(r.nearest_station_m)}분`) },
    { key: "school", title: "가까운 초등학교", metric: "nearest_elementary_m", cell: (r) => (r.nearest_elementary_m === null ? "-" : `약 도보 ${walkMinutes(r.nearest_elementary_m)}분`) },
    ...(commute ? [{ key: "commute", title: "출퇴근", cell: (r: ComplexRow) => <Commute key={`${r.complex_id}:${commute.mode}:${commute.key}`} planId={planId} complexId={r.complex_id} target={commute} /> }] : []),
    { key: "park", title: "가까운 공원", cell: (r) => (r.nearest_park_m === null ? "-" : `${r.nearest_park_name ?? "공원"} 약 도보 ${walkMinutes(r.nearest_park_m)}분`) },
    { key: "shops", title: "반경 500m 생활 상가", cell: (r) => num(r.shop_count_500m, "곳") },
    { key: "redev", group: "정비사업·위험", title: "정비사업", cell: (_, i) => redevelopmentText(i.redevelopment) },
    { key: "risks", title: "위험 요소", cell: (_, i) => (i.risks.length ? (
      <ul className="flex flex-wrap gap-1.5 text-xs font-semibold">
        {i.risks.map((k) => <li key={k} className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-900">{RISK_LABELS[k] ?? k}</li>)}
      </ul>
    ) : "없음") },
  ];
  const cols = data.items.length + 1;
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-3xl border border-chb-line bg-white">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <caption className="sr-only">관심 단지 비교</caption>
          <thead>
            <tr className="border-b border-chb-line">
              <th scope="col" className="sticky left-0 z-10 w-28 border-r border-chb-line bg-white p-4 sm:w-40 text-left font-semibold text-chb-muted">항목</th>
              {data.items.map((i) => (
                <th key={i.complex_id} scope="col" className="p-4 text-left align-bottom">
                  <Link href={`/plans/${planId}/stage/4?complex=${i.complex_id}#complex-detail`} className="group inline-flex items-start gap-1 font-display text-base font-black text-chb-ink hover:text-chb-accent">
                    {i.name}<span aria-hidden="true" className="text-chb-muted transition group-hover:translate-x-0.5 group-hover:text-chb-accent">›</span>
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <Fragment key={l.key}>
                {l.group && (
                  <tr>
                    <th scope="colgroup" colSpan={cols} className="bg-chb-soft2 px-4 py-2 text-left text-xs font-bold tracking-wide text-chb-accent">
                      <span className="sticky left-4">{l.group}</span>
                    </th>
                  </tr>
                )}
                <tr className="border-t border-chb-line align-top first:border-t-0">
                  <th scope="row" className="sticky left-0 z-10 border-r border-chb-line bg-white p-4 text-left font-normal text-chb-muted">{l.title}</th>
                  {data.items.map((i) => {
                    const best = l.metric !== undefined && data.best[l.metric]?.includes(i.complex_id);
                    return (
                      <td key={i.complex_id} className={`p-4 ${l.key === "price" ? "font-display text-lg font-black text-chb-ink" : "text-chb-ink"} ${best && l.key !== "price" ? "font-bold" : ""}`}>
                        {l.cell(byId.get(i.complex_id)!, i)}
                        {best && <span className="ml-1.5 inline-block rounded-full bg-chb-accent px-2 py-0.5 align-middle font-sans text-xs font-semibold text-white">유리</span>}
                      </td>
                    );
                  })}
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-chb-muted">부대비용은 중위가에 샀다고 보고 계산했어요. 중개보수는 상한 요율 기준, 부가세 별도입니다. &lsquo;유리&rsquo;는 항목별로 나은 단지 표시이며 종합 순위가 아닙니다. 도보 시간은 직선거리 기반 추정입니다.</p>
      <TipPanel tips={tips} fieldKey="risks" />
    </div>
  );
}

function Costs({ c }: { c: Costs }) {
  return (
    <>
      {formatWon(c.total)}
      <span className="block text-xs text-chb-muted">취득세 {formatWon(c.acquisitionTax)} · 중개보수 {formatWon(c.brokerage)}</span>
      {c.heavy_tax && <span className="mt-1 inline-block rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">취득세 중과 가능</span>}
    </>
  );
}

function Chips({ met, unmet, missing }: { met: string[]; unmet: string[]; missing: string[] }) {
  const notMet = unmet.filter((k) => !missing.includes(k));
  return (
    <ul className="flex flex-wrap gap-1.5 text-xs font-semibold">
      {met.map((k) => <li key={k} className="rounded-full bg-chb-soft px-2.5 py-1 text-chb-accent">충족 {label(k)}</li>)}
      {notMet.map((k) => <li key={k} className="rounded-full bg-chb-line px-2.5 py-1 text-chb-muted">맞지 않음 {label(k)}</li>)}
      {missing.map((k) => <li key={k} className="rounded-full border border-dashed border-chb-muted/50 px-2.5 py-1 text-chb-muted">데이터 없음 {label(k)}</li>)}
    </ul>
  );
}
