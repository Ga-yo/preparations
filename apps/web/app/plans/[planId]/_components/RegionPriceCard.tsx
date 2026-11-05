import type { ToolResult } from "@/lib/agent/tool";
import { formatWon } from "./format";

type Row = {
  sigungu_code: string; name: string; median_price: number; deal_count: number;
  latest_deal_date: string; low_sample: boolean; affordable?: boolean;
};
type Data = { regions: Row[]; criteria: { months: number } } | { error: string };

const ERRORS: Record<string, string> = {
  region_required: "희망 지역을 저장하면 지역별 시세가 표시됩니다.",
};
const DATASETS: Record<string, string> = {
  "transactions:apartment": "아파트 실거래가", "loan_products:bank": "시중은행 상품", regulated_areas: "규제지역",
  loan_rules: "대출 규제", tax_rates: "세율", policy_loans: "정책대출",
};

export function RegionPriceCard({ result }: { result: ToolResult }) {
  const data = result.data as Data;
  const asOf = Object.entries(result.as_of);
  return (
    <section className="rounded border p-4" aria-label="지역별 시세">
      <h2 className="mb-2 font-semibold">희망 지역 시세</h2>
      {!!result.stale?.length && (
        <p role="alert" className="mb-2 rounded bg-yellow-100 p-2 text-yellow-900">
          오래된 데이터가 포함되어 있습니다 (7일 초과): {result.stale.map((k) => DATASETS[k] ?? k).join(", ")}
        </p>
      )}
      {"error" in data ? (
        <p>{ERRORS[data.error] ?? "지역 시세를 불러오지 못했습니다."}</p>
      ) : result.notices?.includes("no_transactions") ? (
        <p>이 지역은 실거래 데이터가 없습니다(수도권 아파트만 제공).</p>
      ) : (
        <div className="space-y-2 text-sm">
          <table className="w-full text-left [&_td]:pr-3 [&_td]:py-0.5 [&_th]:pr-3">
            <thead><tr><th>지역</th><th>중위가</th><th>거래</th><th>예산 내</th></tr></thead>
            <tbody>
              {data.regions.map((r) => (
                <tr key={r.sigungu_code}>
                  <td>{r.name}</td>
                  <td className="whitespace-nowrap">{formatWon(r.median_price)}</td>
                  <td className="whitespace-nowrap">{r.deal_count}건{r.low_sample && " (표본 적음)"}</td>
                  <td>{r.affordable === undefined ? "-" : r.affordable ? "✓ 가능" : "✗ 초과"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-gray-600">
            최근 {data.criteria.months}개월 수도권 아파트 매매 실거래가 기준, 해제 신고·직거래 제외. 예산 비교는 지역별 대출 규제를 반영한 참고값입니다.
          </p>
          {result.notices?.includes("profile_missing") && <p className="text-gray-600">1단계를 저장하면 예산과 비교해 드립니다.</p>}
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
