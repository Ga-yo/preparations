import type { ToolResult } from "@/lib/agent/tool";
import type { Fit, NeighborStats } from "@/lib/calc/fit";
import { TipPanel, type Tip } from "../../../_components/TipPanel";
import { DATASETS } from "../../../_components/ConditionCheckCard";
import { formatWon } from "../../../_components/format";

type Data = {
  complex: {
    name: string; jibun_address: string | null; road_address: string | null; approval_year: number | null;
    household_count: number | null; building_count: number | null; parking_per_household: number | null;
    floor_area_ratio: number | null; building_coverage_ratio: number | null; land_share_m2: number | null;
  };
  fit: Fit | null;
  trades: { deal_date: string; deal_amount: number; exclusive_area: number; floor: number | null }[];
  monthly: { month: string; median_price: number; deal_count: number }[];
  neighbors: NeighborStats;
  criteria: { area_min: number | null; area_max: number | null; months: number };
};
const dash = (v: number | null, unit = "") => (v === null ? "-" : `${v.toLocaleString("ko-KR")}${unit}`);

export function ComplexDetail({ result, tips }: { result: ToolResult; tips: Tip[] }) {
  if ("error" in (result.data as object)) {
    return <section className="rounded border p-4 text-sm">선택한 단지를 찾을 수 없습니다.</section>;
  }
  const { complex: c, fit, trades, monthly, neighbors: n, criteria } = result.data as Data;
  const asOf = Object.entries(result.as_of).filter(([k]) => /^(complexes|transactions):/.test(k));
  const area = criteria.area_min === null && criteria.area_max === null ? "전체 면적"
    : criteria.area_max === null ? `전용 ${criteria.area_min}㎡ 이상`
    : criteria.area_min === null ? `전용 ${criteria.area_max}㎡ 이하`
    : `전용 ${criteria.area_min}~${criteria.area_max}㎡`;
  return (
    <section id="complex-detail" className="space-y-3 rounded border p-4 text-sm" aria-label="단지 상세">
      <h2 className="text-base font-semibold">{c.name}</h2>
      <p className="text-gray-700">{c.road_address ?? c.jibun_address ?? "주소 정보 없음"}</p>
      <ul className="grid grid-cols-2 gap-x-4">
        <li>승인연도 {`${c.approval_year ?? "-"}년`}</li>
        <li>세대수 {dash(c.household_count, "세대")}</li>
        <li>동 수 {dash(c.building_count, "개")}</li>
        <li>세대당 주차 {dash(c.parking_per_household, "대")}</li>
        <li>용적률 {dash(c.floor_area_ratio, "%")}</li>
        <li>건폐율 {dash(c.building_coverage_ratio, "%")}</li>
        <li>대지지분 {c.land_share_m2 === null ? "-" : `약 ${c.land_share_m2}㎡(단지 평균)`}</li>
      </ul>
      {fit && <p>조건 적합도 {fit.score}점</p>}

      <h3 className="font-semibold">최근 실거래 사례 ({area})</h3>
      {trades.length ? (
        <table className="w-full text-left [&_td]:py-0.5 [&_td]:pr-2">
          <thead><tr><th>계약일</th><th>금액</th><th>전용면적</th><th>층</th></tr></thead>
          <tbody>{trades.map((t, i) => (
            <tr key={i}><td>{t.deal_date}</td><td>{formatWon(t.deal_amount)}</td><td>{t.exclusive_area}㎡</td><td>{t.floor ?? "-"}층</td></tr>
          ))}</tbody>
        </table>
      ) : <p className="text-gray-600">최근 거래 없음</p>}
      <TipPanel tips={tips} fieldKey="trades" />

      <h3 className="font-semibold">월별 중위가 (최근 {criteria.months}개월)</h3>
      {monthly.length ? (
        <table className="w-full text-left [&_td]:py-0.5 [&_td]:pr-2">
          <thead><tr><th>월</th><th>중위가</th><th>거래 건수</th></tr></thead>
          <tbody>{monthly.map((m) => (
            <tr key={m.month}><td>{m.month}</td><td>{formatWon(m.median_price)}</td><td>{m.deal_count}건</td></tr>
          ))}</tbody>
        </table>
      ) : <p className="text-gray-600">월별 거래 없음</p>}
      <TipPanel tips={tips} fieldKey="monthly" />

      <h3 className="font-semibold">같은 동 단지와 비교</h3>
      <p>
        {n.rank === null || n.dong_median === null
          ? `같은 동 ${n.count}개 단지 중 이 단지의 최근 12개월 거래가 없어 순위를 매기지 못했습니다.`
          : `같은 동 가격이 있는 ${n.priced}개 단지 중 중위가 낮은 순 ${n.rank}위, 동 중위값 ${formatWon(n.dong_median)}`}
        {" "}(같은 법정동 기준, 거리 기준 아님)
      </p>
      <TipPanel tips={tips} fieldKey="neighbors" />

      <p className="text-gray-600">교통·학교·생활 인프라: 데이터 준비 중</p>
      <p className="text-gray-600">정비사업 진행 상황: 데이터 준비 중</p>
      <TipPanel tips={tips} fieldKey="redevelopment" />
      {asOf.length > 0 && <p className="text-xs text-gray-600">데이터 기준일: {asOf.map(([k, v]) => `${DATASETS[k] ?? k} ${v}`).join(" · ")}</p>}
    </section>
  );
}
