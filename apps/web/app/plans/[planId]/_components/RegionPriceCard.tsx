import type { ToolResult } from "@/lib/agent/tool";
import { formatWon } from "./format";

type Row = {
  sigungu_code: string; name: string; median_price: number; deal_count: number;
  latest_deal_date: string; low_sample: boolean; affordable?: boolean;
};
type Data = { regions: Row[]; criteria: { months: number; area_min: number | null; area_max: number | null } } | { error: string };

const ERRORS: Record<string, string> = {
  region_required: "희망 지역을 저장하면 지역별 시세가 표시됩니다.",
};
export const DATASETS: Record<string, string> = {
  "transactions:apartment": "아파트 실거래가", "loan_products:bank": "시중은행 상품", regulated_areas: "규제지역",
  loan_rules: "대출 규제", tax_rates: "세율", policy_loans: "정책대출",
};

// flat: 팝업 안에 넣을 때 카드 테두리 없이
export function RegionPriceCard({ result, flat = false }: { result: ToolResult; flat?: boolean }) {
  const data = result.data as Data;
  const asOf = Object.entries(result.as_of);
  return (
    <section className={flat ? "p-4" : "rounded-3xl border border-chb-line bg-white p-6"} aria-label="지역별 시세">
      <h2 className="mb-1 font-display text-2xl font-black tracking-tight">희망 지역 시세</h2>
      {!!result.stale?.length && (
        <p role="alert" className="mb-3 rounded-xl bg-amber-50 p-3 text-amber-900">
          오래된 데이터가 포함되어 있습니다 (7일 초과): {result.stale.map((k) => DATASETS[k] ?? k).join(", ")}
        </p>
      )}
      {"error" in data ? (
        <p className="text-chb-muted">{ERRORS[data.error] ?? "지역 시세를 불러오지 못했습니다."}</p>
      ) : result.notices?.includes("no_transactions") ? (
        <p className="text-chb-muted">이 지역은 실거래 데이터가 없습니다(수도권 아파트만 제공).</p>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-chb-muted">지역별 아파트 매매 실거래가 중위가예요.</p>
          <ul className="space-y-2">
            {data.regions.map((r) => (
              <li key={r.sigungu_code} className="flex items-center justify-between gap-3 rounded-2xl border border-chb-line p-4">
                <div className="min-w-0">
                  <p className="font-semibold">{r.name}</p>
                  <p className="text-chb-muted">거래 {r.deal_count}건{r.low_sample && " · 표본 적음"}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-base font-bold"><span className="sr-only">중위가 </span>{formatWon(r.median_price)}</p>
                  {r.affordable !== undefined && (
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${r.affordable ? "bg-chb-accent-soft text-chb-accent" : "bg-chb-line text-chb-muted"}`}>
                      {r.affordable ? "예산 내" : "예산 초과"}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="text-chb-muted">
            최근 {data.criteria.months}개월 수도권 아파트 매매 실거래가 기준
            {(data.criteria.area_min !== null || data.criteria.area_max !== null) &&
              ` (전용 ${data.criteria.area_min ?? ""}~${data.criteria.area_max ?? ""}㎡)`}
            , 해제 신고·직거래 제외. 예산 비교는 지역별 대출 규제를 반영한 참고값입니다.
          </p>
          {result.notices?.includes("profile_missing") && <p className="text-chb-muted">1단계를 저장하면 예산과 비교해 드립니다.</p>}
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
