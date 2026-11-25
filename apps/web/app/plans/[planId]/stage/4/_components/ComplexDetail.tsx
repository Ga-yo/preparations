import type { ToolResult } from "@/lib/agent/tool";
import type { Fit, NeighborStats } from "@/lib/calc/fit";
import { TipPanel, type Tip } from "../../../_components/TipPanel";
import { DATASETS } from "../../../_components/ConditionCheckCard";
import { walkMinutes } from "@/lib/calc/walk";
import type { CommuteTarget } from "@/lib/route/commute";
import { Commute } from "../../../_components/Commute";
import { formatWon, livingText } from "../../../_components/format";
import { redevelopmentText } from "../../../_components/redevelopment";
import type { RedevelopmentInfo } from "@/lib/agent/redevelopment";
import { DetailTabs } from "./DetailTabs";
import { FavoriteButton } from "./FavoriteButton";
import { FitChips } from "./FitChips";
import { PriceTab, type AreaPrices } from "./PriceTab";

type Data = {
  complex: {
    id: number; name: string; median_price: number | null; deal_count: number; jibun_address: string | null; road_address: string | null; approval_year: number | null;
    household_count: number | null; building_count: number | null; parking_per_household: number | null;
    floor_area_ratio: number | null; building_coverage_ratio: number | null; land_share_m2: number | null;
    nearest_park_name?: string | null; nearest_park_m: number | null; shop_count_500m: number | null;
  };
  fit: Fit | null;
  redevelopment?: RedevelopmentInfo;
  commute?: CommuteTarget | null;
  nearby: { category: string; name: string; lines: string[] | null; distance_m: number }[];
  areas: AreaPrices[];
  default_area: number | null;
  neighbors: NeighborStats;
  criteria: { area_min: number | null; area_max: number | null; chart_months: number };
};
const CATEGORY: Record<string, string> = { subway_station: "지하철역", elementary_school: "초등학교", middle_school: "중학교", high_school: "고등학교" };
const dash = (v: number | null, unit = "") => (v === null ? "-" : `${v.toLocaleString("ko-KR")}${unit}`);

export function ComplexDetail({ planId, result, tips }: { planId: string; result: ToolResult; tips: Tip[] }) {
  if ("error" in (result.data as object)) {
    return <section className="rounded-3xl border border-chb-line bg-white p-6 text-sm text-chb-muted">선택한 단지를 찾을 수 없습니다.</section>;
  }
  const { complex: c, fit, redevelopment, commute, nearby, areas, default_area, neighbors: n, criteria } = result.data as Data;
  const hasCoords = !result.notices?.includes("no_location_data"); // 툴이 단지 좌표 유무로 정한다
  const asOf = Object.entries(result.as_of).filter(([k]) => /^(complexes|transactions|pois|redevelopment):/.test(k));
  const area = criteria.area_min === null && criteria.area_max === null ? "전체 면적"
    : criteria.area_max === null ? `전용 ${criteria.area_min}㎡ 이상`
    : criteria.area_min === null ? `전용 ${criteria.area_max}㎡ 이하`
    : `전용 ${criteria.area_min}~${criteria.area_max}㎡`;
  const h3 = "border-t border-chb-line pt-5 font-bold text-chb-ink first:border-t-0 first:pt-0";
  const table = "w-full text-left [&_td]:border-t [&_td]:border-chb-line [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2";

  const neighborsText = `${n.rank === null || n.dong_median === null
    ? `같은 동 ${n.count}개 단지 중 이 단지의 최근 12개월 거래가 없어 순위를 매기지 못했습니다.`
    : `같은 동 가격이 있는 ${n.priced}개 단지 중 중위가 낮은 순 ${n.rank}위, 동 중위값 ${formatWon(n.dong_median)}`} (같은 법정동 기준, 거리 기준 아님)`;
  const prices = (
    <PriceTab key={c.id} areas={areas} defaultArea={default_area} areaText={area} neighborsText={neighborsText}
      tips={{ trades: <TipPanel tips={tips} fieldKey="trades" />, monthly: <TipPanel tips={tips} fieldKey="monthly" />, neighbors: <TipPanel tips={tips} fieldKey="neighbors" /> }} />
  );

  const info = (
    <>
      <ul className="grid grid-cols-2 gap-2 [&_li]:rounded-xl [&_li]:bg-chb-soft2 [&_li]:px-3 [&_li]:py-2">
        <li>승인연도 {`${c.approval_year ?? "-"}년`}</li>
        <li>세대수 {dash(c.household_count, "세대")}</li>
        <li>동 수 {dash(c.building_count, "개")}</li>
        <li>세대당 주차 {dash(c.parking_per_household, "대")}</li>
        <li>용적률 {dash(c.floor_area_ratio, "%")}</li>
        <li>건폐율 {dash(c.building_coverage_ratio, "%")}</li>
        <li>대지지분 {c.land_share_m2 === null ? "-" : `약 ${c.land_share_m2}㎡(단지 평균)`}</li>
      </ul>
      <p className="text-xs text-chb-muted">대지지분은 대지면적 ÷ 세대수 평균값입니다.</p>
    </>
  );

  const around = (
    <>
      <h3 className={h3}>주변 시설 (1km 이내)</h3>
      {commute && <Commute key={`${c.id}:${commute.mode}:${commute.key}`} planId={planId} complexId={c.id} target={commute} />}
      {nearby.length ? (
        <>
          <div className="overflow-x-auto rounded-2xl border border-chb-line"><table aria-label="주변 시설 (1km 이내)" className={table}>
            <thead className="bg-chb-soft2 text-chb-muted"><tr><th scope="col">구분</th><th scope="col">이름</th><th scope="col">노선</th><th scope="col">도보</th></tr></thead>
            <tbody>{nearby.map((p, i) => (
              <tr key={i}><td>{CATEGORY[p.category] ?? "기타"}</td><td>{p.name}</td>
                <td>{p.category === "subway_station" ? p.lines?.join(", ") ?? "-" : "-"}</td><td>약 {walkMinutes(p.distance_m)}분</td></tr>
            ))}</tbody>
          </table></div>
          <p className="text-xs text-chb-muted">도보 시간은 직선거리 기반 추정입니다.</p>
        </>
      ) : <p className="text-chb-muted">{hasCoords ? "직선거리 1km 안에 역·학교가 없습니다." : "좌표 정보가 없어 주변 시설을 표시하지 못했습니다."}</p>}
      {livingText(c) && <p>{livingText(c)}</p>}
    </>
  );

  const redev = (
    <>
      <p className={redevelopment?.status === "in_zone" ? "font-medium" : "text-chb-muted"}>정비사업: {redevelopmentText(redevelopment)}</p>
      <TipPanel tips={tips} fieldKey="redevelopment" />
    </>
  );

  return (
    <section id="complex-detail" className="flex min-h-0 flex-1 flex-col rounded-3xl border border-chb-line bg-white p-6 pb-4 text-sm" aria-label="단지 상세">
      <div className="shrink-0 space-y-2 pb-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-2xl font-black tracking-tight">{c.name}</h2>
          <FavoriteButton complexId={c.id} name={c.name} />
        </div>
        <p className="text-chb-muted">{c.road_address ?? c.jibun_address ?? "주소 정보 없음"}</p>
        <p className="text-chb-muted">
          {c.median_price === null
            ? <span className="font-display text-3xl font-black text-chb-ink">최근 거래 없음</span>
            : <><span className="mr-2 font-display text-3xl font-black text-chb-ink">{formatWon(c.median_price)}</span>최근 12개월 중위가 · 거래 {c.deal_count}건</>}
        </p>
        {fit && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-chb-accent px-2.5 py-1 text-xs font-bold text-white">적합도 {fit.score}점</span>
            <FitChips fit={fit} />
          </div>
        )}
      </div>
      <DetailTabs tabs={[
        { key: "prices", label: "시세·실거래", content: prices },
        { key: "info", label: "단지 정보", content: info },
        { key: "around", label: "주변·교통", content: around },
        { key: "redevelopment", label: "정비사업", content: redev },
      ]} />
      {asOf.length > 0 && <p className="shrink-0 border-t border-chb-line pt-3 text-xs text-chb-muted">데이터 기준일: {asOf.map(([k, v]) => `${DATASETS[k] ?? k} ${v}`).join(" · ")}</p>}
    </section>
  );
}
