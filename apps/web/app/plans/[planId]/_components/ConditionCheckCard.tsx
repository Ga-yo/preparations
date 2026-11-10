import type { ToolResult } from "@/lib/agent/tool";
import type { ComplexRow, Conflict } from "@/lib/calc/conditions";
import { formatWon } from "./format";
import { TipPanel, type Tip } from "./TipPanel";

type Data =
  | { conflicts: Conflict[]; notices: string[]; matches: ComplexRow[];
      counts: { total: number; must: number; prefer: Record<string, number> }; criteria: { months: number } }
  | { error: string };

export const CONDITION_LABELS: Record<string, string> = {
  price_max: "희망 최고가", area: "희망 면적", approval_year_min: "준공 연도", household_count_min: "세대수",
  parking_per_household_min: "세대당 주차", floor_area_ratio_max: "용적률 상한",
};
const ERRORS: Record<string, string> = {
  region_required: "2단계에서 희망 지역을 저장하면 조건을 점검해 드립니다.",
  conditions_required: "주택 조건을 저장하면 예산·시세·단지 데이터와 비교해 드립니다.",
};
const NOTICES: Record<string, string> = {
  no_data_for_type: "오피스텔·연립·다세대는 아직 데이터가 없어 아파트만 점검했습니다.",
  "data_unavailable:mgmt_fee": "관리비 조건은 아직 점검할 데이터가 없습니다.",
  unit_level_condition: "방·욕실 수, 층, 향은 세대마다 달라 단지 단위로 점검하지 않습니다.",
  no_complex_data: "희망 지역에 단지 데이터가 아직 없습니다.",
  truncated: "단지가 많아 3,000개까지만 점검했습니다. 지역을 좁혀 보세요.",
};
const DATASETS: Record<string, string> = {
  "complexes:building_ledger": "건축물대장 단지", "transactions:apartment": "아파트 실거래가",
  "loan_products:bank": "시중은행 상품", regulated_areas: "규제지역", loan_rules: "대출 규제", tax_rates: "세율", policy_loans: "정책대출",
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

export function ConditionCheckCard({ result, tips }: { result: ToolResult; tips: Tip[] }) {
  const data = result.data as Data;
  const asOf = Object.entries(result.as_of);
  return (
    <section className="rounded border p-4" aria-label="조건 점검">
      <h2 className="mb-2 font-semibold">조건 점검</h2>
      {!!result.stale?.length && (
        <p role="alert" className="mb-2 rounded bg-yellow-100 p-2 text-yellow-900">
          오래된 데이터가 포함되어 있습니다: {result.stale.map((k) => DATASETS[k] ?? k).join(", ")}
        </p>
      )}
      {"error" in data ? (
        <p>{ERRORS[data.error] ?? "조건을 점검하지 못했습니다."}</p>
      ) : (
        <div className="space-y-2 text-sm">
          {data.conflicts.length ? (
            <ul className="list-disc space-y-1 pl-5 text-red-800">
              {data.conflicts.map((c) => <li key={c.code}>{conflictText(c)}</li>)}
            </ul>
          ) : <p>필수 조건 사이에 충돌이 없습니다.</p>}
          <p>
            희망 지역 단지 {data.counts.total.toLocaleString("ko-KR")}개 중 필수 조건 충족 {data.counts.must.toLocaleString("ko-KR")}개
            {Object.entries(data.counts.prefer).map(([k, n]) => ` · 그중 ${CONDITION_LABELS[k] ?? k} 충족 ${n}개`).join("")}
          </p>
          {data.notices.filter((n) => NOTICES[n]).map((n) => <p key={n} className="text-gray-600">{NOTICES[n]}</p>)}
          {data.matches.length > 0 && (
            <>
              <table className="w-full text-left [&_td]:py-0.5 [&_td]:pr-2 [&_th]:pr-2">
                <thead><tr><th>단지</th><th>준공</th><th>세대</th><th>용적률</th><th>대지지분</th><th>중위가</th></tr></thead>
                <tbody>
                  {data.matches.map((m) => (
                    <tr key={m.complex_id}>
                      <td>{m.name}</td>
                      <td>{m.approval_year ?? "-"}</td>
                      <td>{m.household_count?.toLocaleString("ko-KR") ?? "-"}</td>
                      <td>{m.floor_area_ratio === null ? "-" : `${m.floor_area_ratio}%`}</td>
                      <td className="whitespace-nowrap">{m.land_share_m2 === null ? "-" : `약 ${m.land_share_m2}㎡(평균)`}</td>
                      <td className="whitespace-nowrap">{m.median_price === null ? "거래 없음" : `${formatWon(m.median_price)} (${m.deal_count}건)`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TipPanel tips={tips} fieldKey="land_share" />
              <p className="text-gray-600">
                중위가는 최근 {data.criteria.months}개월 이 단지 아파트 매매 실거래가(희망 면적, 해제 신고·직거래 제외) 기준입니다.
                대지지분은 대지면적 ÷ 세대수 평균값입니다.
              </p>
            </>
          )}
        </div>
      )}
      {asOf.length > 0 && (
        <p className="mt-3 text-xs text-gray-600">
          데이터 기준일: {asOf.map(([k, v]) => `${DATASETS[k] ?? k} ${v}`).join(" · ")}
        </p>
      )}
    </section>
  );
}
