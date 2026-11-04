import type { BudgetResult, Diagnosis } from "@/lib/calc/budget";
import type { ToolResult } from "@/lib/agent/tool";
import { formatWon } from "./format";

const DIAGNOSES: Record<Diagnosis, string> = {
  region_unspecified: "지역 미지정: 비규제 지방 기준으로 계산한 값입니다. 서울·수도권·규제지역은 대출 한도가 크게 낮아질 수 있습니다.",
  debt_payment_missing: "기존 대출의 연간 원리금 상환액이 입력되지 않아 DSR 계산에서 0원으로 보았습니다. 실제 한도는 더 낮을 수 있습니다.",
  missing_income: "연 소득이 0원이거나 입력되지 않아 대출 한도를 계산하지 못했습니다.",
  rule_missing: "해당 시점에 적용할 대출 규제 정보가 없어 대출 가능액을 0원으로 보았습니다. 1주택·다주택 대출 규제는 아직 반영되지 않았을 수 있습니다.",
  dsr_binding: "소득 대비 원리금 상환 한도(DSR)가 대출 가능액을 제한했습니다.",
  ltv_binding: "집값 대비 대출 비율(LTV)이 대출 가능액을 제한했습니다.",
  cap_binding: "대출 한도 상한이 대출 가능액을 제한했습니다.",
  heavy_tax_possible: "보유 주택 수 때문에 취득세가 중과될 수 있습니다.",
  no_eligible_product: "조건에 맞는 대출 상품이 없습니다.",
  funds_only: "대출 없이 보유 자금만으로 계산한 예산입니다.",
};
const DATASETS: Record<string, string> = {
  "loan_products:bank": "시중은행 상품", regulated_areas: "규제지역", loan_rules: "대출 규제",
  tax_rates: "세율", policy_loans: "정책대출",
};
const BINDING = { ltv: "LTV 한도", loan_cap: "한도 상한", dsr: "DSR 한도" } as const;
const ERRORS: Record<string, string> = {
  profile_missing: "왼쪽 폼을 저장하면 예산이 계산됩니다.",
  region_ambiguous: "지역명이 여러 곳과 일치합니다.",
  region_not_found: "지역을 찾지 못했습니다.",
};

type Data = (Omit<BudgetResult, "loan"> & { loan: { amount: number; binding?: keyof typeof BINDING } }) | { error: string };

export function BudgetCard({ result }: { result: ToolResult }) {
  const data = result.data as Data;
  const asOf = Object.entries(result.as_of);
  return (
    <section className="rounded border p-4" aria-label="예산 결과">
      <h2 className="mb-2 font-semibold">구매 가능 예산</h2>
      {result.notices?.includes("dummy_data:loan_products:bank") && (
        <p role="alert" className="mb-2 rounded bg-red-100 p-2 font-bold text-red-800">
          은행 상품 금리는 테스트용 가짜 데이터입니다
        </p>
      )}
      {!!result.stale?.length && (
        <p role="alert" className="mb-2 rounded bg-yellow-100 p-2 text-yellow-900">
          오래된 데이터가 포함되어 있습니다 (7일 초과): {result.stale.join(", ")}
        </p>
      )}
      {"error" in data ? (
        <p>{ERRORS[data.error] ?? "예산을 계산하지 못했습니다."}</p>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-lg">
            예산 범위: {formatWon(data.maxRatePrice)} ~ {formatWon(data.minRatePrice)}
          </p>
          <p>
            대출 가능액: {formatWon(data.loan.amount)}
            {data.loan.binding && ` (${BINDING[data.loan.binding]} 적용)`}
          </p>
          <p>자기자금: {formatWon(data.ownFunds)}</p>
          {data.products.length > 0 && (
            <table className="w-full text-left">
              <caption className="text-left font-medium">상품별 월 상환액</caption>
              <thead><tr><th>상품</th><th>대출액</th><th>월 상환액</th></tr></thead>
              <tbody>
                {data.products.map((p) => (
                  <tr key={p.productId}>
                    <td>{p.provider} {p.name}{p.rateType && ` (${p.rateType === "fixed" ? "고정" : p.rateType === "variable" ? "변동" : p.rateType})`}</td>
                    <td>{formatWon(p.loanAmount)}</td>
                    <td>
                      {p.monthlyAtMin === null ? "-" : formatWon(p.monthlyAtMin)}
                      {p.monthlyAtMax !== null && p.monthlyAtMax !== p.monthlyAtMin && ` ~ ${formatWon(p.monthlyAtMax)}`}
                      {" "}({p.termYears}년)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div>
            <p className="font-medium">부대비용: 총 {formatWon(data.costs.total)}</p>
            <ul className="list-disc pl-5">
              <li>취득세 {formatWon(data.costs.acquisitionTax)}</li>
              <li>중개보수 {formatWon(data.costs.brokerage)}</li>
            </ul>
            <p className="text-gray-600">중개보수는 상한 요율 기준, 부가세 별도입니다.</p>
          </div>
          {data.diagnoses.includes("region_unspecified") && (
            <p role="alert" className="rounded bg-yellow-100 p-2 font-bold text-yellow-900">{DIAGNOSES.region_unspecified}</p>
          )}
          {data.diagnoses.length > 0 && (
            <ul className="list-disc pl-5">
              {data.diagnoses.filter((d) => d !== "region_unspecified").map((d) => <li key={d}>{DIAGNOSES[d]}</li>)}
            </ul>
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
