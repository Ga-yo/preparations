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

// flat: 팝업 안에 넣을 때 카드 테두리 없이
export function BudgetCard({ result, flat = false }: { result: ToolResult; flat?: boolean }) {
  const data = result.data as Data;
  const asOf = Object.entries(result.as_of);
  return (
    <section className={flat ? "p-4" : "rounded-3xl border border-chb-line bg-white p-6"} aria-label="예산 결과">
      <h2 className="mb-3 text-sm font-semibold text-chb-muted">구매 가능 예산</h2>
      {result.notices?.includes("dummy_data:loan_products:bank") && (
        <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 font-bold text-red-800">
          은행 상품 금리는 테스트용 가짜 데이터입니다
        </p>
      )}
      {!!result.stale?.length && (
        <p role="alert" className="mb-3 rounded-xl bg-amber-50 p-3 text-amber-900">
          오래된 데이터가 포함되어 있습니다 (7일 초과): {result.stale.join(", ")}
        </p>
      )}
      {"error" in data ? (
        <p className="text-chb-muted">{ERRORS[data.error] ?? "예산을 계산하지 못했습니다."}</p>
      ) : (
        <div className="space-y-4 text-sm">
          <p className="font-display text-2xl font-black tracking-tight text-chb-ink">
            <span className="sr-only">예산 범위: </span>{formatWon(data.maxRatePrice)} ~ {formatWon(data.minRatePrice)}
          </p>
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-chb-soft2 p-3">
              <dt className="text-chb-muted">대출 가능액</dt>
              <dd className="mt-1 text-base font-semibold">
                {formatWon(data.loan.amount)}
                {data.loan.binding && <span className="block text-xs font-normal text-chb-muted">{BINDING[data.loan.binding]} 적용</span>}
              </dd>
            </div>
            <div className="rounded-2xl bg-chb-soft2 p-3">
              <dt className="text-chb-muted">자기자금</dt>
              <dd className="mt-1 text-base font-semibold">{formatWon(data.ownFunds)}</dd>
            </div>
          </dl>
          {data.products.length > 0 && (
            <table className="w-full text-left [&_td]:pr-3 [&_td]:py-0.5 [&_th]:pr-3 [&_td:not(:first-child)]:whitespace-nowrap">
              <caption className="mb-1 text-left font-semibold">상품별 월 상환액</caption>
              <thead className="text-chb-muted"><tr><th className="font-normal">상품</th><th className="font-normal">대출액</th><th className="font-normal">월 상환액</th></tr></thead>
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
            <p className="font-semibold">부대비용: 총 {formatWon(data.costs.total)}</p>
            <ul className="list-disc pl-5">
              <li>취득세 {formatWon(data.costs.acquisitionTax)}</li>
              <li>중개보수 {formatWon(data.costs.brokerage)}</li>
            </ul>
            <p className="text-chb-muted">중개보수는 상한 요율 기준, 부가세 별도입니다.</p>
          </div>
          {data.diagnoses.includes("region_unspecified") && (
            <p role="alert" className="rounded-xl bg-amber-50 p-3 font-semibold text-amber-900">{DIAGNOSES.region_unspecified}</p>
          )}
          {data.diagnoses.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-chb-muted">
              {data.diagnoses.filter((d) => d !== "region_unspecified").map((d) => <li key={d}>{DIAGNOSES[d]}</li>)}
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
