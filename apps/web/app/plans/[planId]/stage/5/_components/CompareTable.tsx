import Link from "next/link";
import type { RedevelopmentInfo } from "@/lib/agent/redevelopment";
import type { CompareItem, CompareResult, Metric } from "@/lib/calc/compare";
import type { ComplexRow } from "@/lib/calc/conditions";
import { CONDITION_LABELS } from "../../../_components/ConditionCheckCard";
import { formatWon } from "../../../_components/format";
import { redevelopmentText } from "../../../_components/redevelopment";
import { TipPanel, type Tip } from "../../../_components/TipPanel";

type Item = CompareItem & { redevelopment?: RedevelopmentInfo };
export type CompareData = Omit<CompareResult, "items"> & { items: Item[]; rows: ComplexRow[]; criteria: { months: number; area_min: number | null; area_max: number | null } };

export const RISK_LABELS: Record<string, string> = {
  over_budget: "예산 초과", budget_unknown: "예산 판단 불가(1단계 미저장)", few_trades: "거래 적음(1~2건)",
  no_recent_trades: "최근 거래 없음", old_building: "사용승인 30년 이상", no_location: "위치 정보 없음",
  outside_conditions: "현재 조건 밖", redevelopment_in_zone: "정비구역 안",
};
const label = (k: string) => CONDITION_LABELS[k] ?? k;
const num = (v: number | null, unit = "") => (v === null ? "-" : `${v.toLocaleString("ko-KR")}${unit}`);

type Line = { key: string; title: string; metric?: Metric; cell: (r: ComplexRow, i: Item) => React.ReactNode };

export function CompareTable({ planId, data, tips }: { planId: string; data: CompareData; tips: Tip[] }) {
  const byId = new Map(data.rows.map((r) => [r.complex_id, r]));
  const lines: Line[] = [
    { key: "price", title: `최근 ${data.criteria.months}개월 중위가`, metric: "median_price", cell: (r) => (r.median_price === null ? "최근 거래 없음" : formatWon(r.median_price)) },
    { key: "gap", title: "최저가 단지와 차이", cell: (_, i) => (i.price_gap_from_min === null ? "-" : i.price_gap_from_min === 0 ? "최저" : `+${formatWon(i.price_gap_from_min)}`) },
    { key: "ratio", title: "예산 대비", cell: (_, i) => (i.budget_ratio === null ? "-" : `${Math.round(i.budget_ratio * 100)}%`) },
    { key: "deals", title: "거래 건수", cell: (r) => `${r.deal_count}건` },
    { key: "fit", title: "적합도", metric: "fit_score", cell: (_, i) => (i.fit ? `${i.fit.score}점` : "현재 조건 밖") },
    { key: "met", title: "조건 충족", cell: (_, i) => (i.fit ? <Chips met={i.fit.met} unmet={i.fit.unmet} missing={i.fit.missing} /> : "-") },
    { key: "year", title: "사용승인 연도", metric: "approval_year", cell: (r) => (r.approval_year === null ? "-" : `${r.approval_year}년`) },
    { key: "hh", title: "세대수", metric: "household_count", cell: (r) => num(r.household_count, "세대") },
    { key: "parking", title: "세대당 주차", metric: "parking_per_household", cell: (r) => num(r.parking_per_household, "대") },
    { key: "far", title: "용적률", cell: (r) => num(r.floor_area_ratio, "%") },
    { key: "land", title: "대지지분(평균 근사)", metric: "land_share_m2", cell: (r) => num(r.land_share_m2, "㎡") },
    { key: "station", title: "가까운 역(직선)", metric: "nearest_station_m", cell: (r) => (r.nearest_station_m === null ? "-" : `${r.nearest_station_name ?? ""} ${num(r.nearest_station_m, "m")}`) },
    { key: "school", title: "가까운 초등학교(직선)", metric: "nearest_elementary_m", cell: (r) => num(r.nearest_elementary_m, "m") },
    { key: "redev", title: "정비사업", cell: (_, i) => redevelopmentText(i.redevelopment) },
    { key: "risks", title: "위험 요소", cell: (_, i) => (i.risks.length ? i.risks.map((k) => RISK_LABELS[k] ?? k).join(", ") : "없음") },
  ];
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-sm">
          <caption className="sr-only">관심 단지 비교</caption>
          <thead>
            <tr>
              <th scope="col" className="border-b p-2 text-left">항목</th>
              {data.items.map((i) => (
                <th key={i.complex_id} scope="col" className="border-b p-2 text-left">
                  <Link href={`/plans/${planId}/stage/4?complex=${i.complex_id}#complex-detail`} className="text-blue-800">{i.name}</Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key} className="align-top">
                <th scope="row" className="border-b p-2 text-left font-normal text-gray-700">{l.title}</th>
                {data.items.map((i) => {
                  const best = l.metric !== undefined && data.best[l.metric]?.includes(i.complex_id);
                  return (
                    <td key={i.complex_id} className={`border-b p-2 ${best ? "font-semibold" : ""}`}>
                      {l.cell(byId.get(i.complex_id)!, i)}{best && <span className="ml-1 text-xs text-green-800">유리</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-600">&lsquo;유리&rsquo;는 항목별로 나은 단지 표시이며 종합 순위가 아닙니다. 관리비는 단지 이름을 눌러 상세에서 확인하세요. 거리는 직선거리입니다.</p>
      <TipPanel tips={tips} fieldKey="risks" />
    </div>
  );
}

function Chips({ met, unmet, missing }: { met: string[]; unmet: string[]; missing: string[] }) {
  const notMet = unmet.filter((k) => !missing.includes(k));
  return (
    <ul className="flex flex-wrap gap-1">
      {met.map((k) => <li key={k} className="rounded bg-green-100 px-1 text-green-900">✓ {label(k)}</li>)}
      {notMet.map((k) => <li key={k} className="rounded bg-gray-100 px-1 text-gray-700">✗ {label(k)}</li>)}
      {missing.map((k) => <li key={k} className="rounded border border-dashed px-1 text-gray-700">? {label(k)} 데이터 없음</li>)}
    </ul>
  );
}
