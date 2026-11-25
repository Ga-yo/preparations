import type { ToolResult } from "@/lib/agent/tool";
import type { Conflict } from "@/lib/calc/conditions";
import { formatWon } from "./format";

type Data =
  | { conflicts: Conflict[]; notices: string[]; counts: { total: number; must: number; prefer: Record<string, number> } }
  | { error: string };

export const CONDITION_LABELS: Record<string, string> = {
  price_max: "희망 최고가", area: "희망 면적", approval_year_min: "준공 연도", household_count_min: "세대수",
  parking_per_household_min: "세대당 주차", floor_area_ratio_max: "용적률 상한",
  station_distance_max: "지하철역 거리", elementary_distance_max: "초등학교 거리",
};
export const ERRORS: Record<string, string> = {
  region_required: "2단계에서 희망 지역을 저장하면 조건을 점검해 드립니다.",
  conditions_required: "주택 조건을 저장하면 예산·시세·단지 데이터와 비교해 드립니다.",
};
export const NOTICES: Record<string, string> = {
  no_data_for_type: "오피스텔·연립·다세대는 아직 데이터가 없어 아파트만 점검했습니다.",
  unit_level_condition: "방·욕실 수, 층, 향은 세대마다 달라 단지 단위로 점검하지 않습니다.",
  no_complex_data: "희망 지역에 단지 데이터가 아직 없습니다.",
  no_location_data: "교통·학교·생활 인프라 데이터는 아직 없습니다.",
  location_partial: "좌표가 없는 단지는 거리 조건을 판단하지 못했습니다.",
  no_poi_data: "역·학교 위치나 희망 지역 단지 좌표가 아직 없어 거리 조건을 점검하지 못했습니다.",
  truncated: "단지가 많아 3,000개까지만 점검했습니다. 지역을 좁혀 보세요.",
  no_shop_data: "생활 상가 데이터가 아직 없어 편의시설 중요도를 반영하지 못했습니다.",
  commute_is_straight_line: "출퇴근 거리는 직선거리 근사입니다. 실제 이동 시간은 노선·환승에 따라 다릅니다.",
};
export const DATASETS: Record<string, string> = {
  "complexes:building_ledger": "건축물대장 단지", "transactions:apartment": "아파트 실거래가",
  "loan_products:bank": "시중은행 상품", regulated_areas: "규제지역", loan_rules: "대출 규제", tax_rates: "세율", policy_loans: "정책대출",
  "complexes:location": "단지 좌표", "pois:subway_station": "지하철역 위치", "pois:school": "학교 위치", "redevelopment:seoul": "서울 정비사업", "pois:park": "공원 위치", "complexes:shops": "생활 상가",
};
const names = (keys: string[]) => keys.map((k) => CONDITION_LABELS[k] ?? k).join(", ");

function conflictText(c: Conflict): string {
  switch (c.code) {
    case "price_min_over_budget": return `희망 최저가가 예상 구매 가능 예산(최대 ${formatWon(c.budget_max)})보다 높습니다.`;
    case "price_max_over_budget": return `희망 최고가가 예상 구매 가능 예산(최대 ${formatWon(c.budget_max)})을 넘습니다.`;
    case "area_price_mismatch": return "희망 면적의 지역 중위가가 모든 희망 지역에서 희망 최고가보다 높습니다.";
    case "no_match_for_musts": return c.blocking.length
      ? `필수 조건을 모두 만족하는 단지가 없습니다. 다음 조건 중 하나를 '선호'로 바꾸면 후보가 생깁니다: ${names(c.blocking)}`
      : "필수 조건을 모두 만족하는 단지가 없습니다. 조건 하나만 바꿔서는 후보가 생기지 않아 여러 조건을 함께 조정해야 합니다.";
    case "few_matches_for_musts": return `필수 조건을 만족하는 단지가 ${c.count}개뿐입니다.`;
  }
}

// flat: 팝업 안에 넣을 때 카드 테두리 없이
export function ConditionCheckCard({ result, flat = false }: { result: ToolResult; flat?: boolean }) {
  const data = result.data as Data;
  const asOf = Object.entries(result.as_of);
  return (
    <section className={flat ? "p-4" : "rounded-3xl border border-chb-line bg-white p-6"} aria-label="조건 점검">
      <h2 className="mb-3 font-display text-2xl font-black tracking-tight">조건 점검</h2>
      {!!result.stale?.length && (
        <p role="alert" className="mb-3 rounded-xl bg-amber-50 p-3 text-amber-900">
          오래된 데이터가 포함되어 있습니다: {result.stale.map((k) => DATASETS[k] ?? k).join(", ")}
        </p>
      )}
      {"error" in data ? (
        <p className="text-chb-muted">{ERRORS[data.error] ?? "조건을 점검하지 못했습니다."}</p>
      ) : (
        <div className="space-y-3 text-sm">
          {data.conflicts.length ? (
            <ul className="space-y-2">
              {data.conflicts.map((c) => (
                <li key={c.code} role="alert" className="flex gap-2 rounded-2xl bg-red-50 p-4 text-red-900">
                  <span aria-hidden="true" className="font-bold">!</span><span>{conflictText(c)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="rounded-2xl bg-chb-soft2 p-4 font-semibold text-chb-accent">✓ 필수 조건 사이에 충돌이 없습니다.</p>}
          {/* 필수 조건이 아무것도 거르지 않으면 두 수가 같아 한 칸으로 합친다 */}
          <dl className={`grid gap-3 ${data.counts.total === data.counts.must ? "" : "grid-cols-2"}`}>
            {data.counts.total !== data.counts.must && (
              <div className="rounded-2xl bg-chb-soft2 p-4">
                <dt className="text-chb-muted">희망 지역 단지</dt>
                <dd className="mt-1 font-display text-xl font-black">{data.counts.total.toLocaleString("ko-KR")}곳</dd>
              </div>
            )}
            <div className="rounded-2xl bg-chb-soft2 p-4">
              <dt className="text-chb-muted">{data.counts.total === data.counts.must ? "희망 지역 단지 · 모두 필수 조건 충족" : "필수 조건 충족"}</dt>
              <dd className="mt-1 font-display text-xl font-black text-chb-accent">{data.counts.must.toLocaleString("ko-KR")}곳</dd>
            </div>
          </dl>
          {/* 선호 조건마다 필수 충족 단지 중에서 따로 센 값이라 누적(깔때기)처럼 이어 쓰지 않는다 */}
          {Object.keys(data.counts.prefer).length > 0 && (
            <p className="text-chb-muted">
              필수 조건 충족 {data.counts.must.toLocaleString("ko-KR")}개 중 선호 조건별 충족(각각 따로 셈): {Object.entries(data.counts.prefer).map(([k, n]) => `${CONDITION_LABELS[k] ?? k} ${n.toLocaleString("ko-KR")}개`).join(" · ")}
            </p>
          )}
          {data.notices.filter((n) => NOTICES[n]).length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-chb-muted">
              {data.notices.filter((n) => NOTICES[n]).map((n) => <li key={n}>{NOTICES[n]}</li>)}
            </ul>
          )}
        </div>
      )}
      {asOf.length > 0 && (
        <p className="mt-4 text-xs text-chb-muted">
          데이터 기준일: {asOf.map(([k, v]) => `${DATASETS[k] ?? k} ${v}`).join(" · ")}
        </p>
      )}
    </section>
  );
}
