import type { BudgetResult, Diagnosis } from "@/lib/calc/budget";
import type { ToolResult } from "@/lib/agent/tool";
import { formatWon } from "./format";
import { byMonthly, type ProductPayment } from "./products";

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

// flat: 팝업 안에 넣을 때 카드 테두리 없이. income(원): 설명 문장용. 툴 결과에는 소득 원값을 넣지 않아 화면이 따로 넘긴다
export function BudgetCard({ result, flat = false, income }: { result: ToolResult; flat?: boolean; income?: number | null }) {
  const data = result.data as Data;
  const asOf = Object.entries(result.as_of);
  return (
    <section className={flat ? "p-4" : "rounded-3xl border border-chb-line bg-white p-6"} aria-label="예산 결과">
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
          <BudgetHeadline data={data} income={income} />
          {data.products.length > 0 && <ProductList products={data.products} />}
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

type Budget = Exclude<Data, { error: string }>;
const loanText = (n: number) => (n > 0 ? `대출 ${formatWon(n)}` : "대출 없이 내 돈으로만");

// 두 금리 조건의 예산을 나란히: 안정 = 가장 높은 금리 기준(maxRatePrice), 최대 = 가장 낮은 금리 기준(minRatePrice)
function BudgetHeadline({ data, income }: { data: Budget; income?: number | null }) {
  const same = data.maxRatePrice === data.minRatePrice;
  const basis = [income ? `연소득 ${formatWon(income)}` : null, `구매에 쓸 수 있는 내 돈 ${formatWon(data.ownFunds)}`].filter(Boolean).join(", ");
  const pct = data.minRatePrice > 0 ? Math.round((data.maxRatePrice / data.minRatePrice) * 100) : 0;
  return (
    <div>
      <h2 className="font-display text-3xl leading-tight font-black tracking-tight text-chb-ink">
        금리가 올라도 살 수 있는 집값은<br />
        <span className="text-chb-accent">{formatWon(data.maxRatePrice)}</span>까지예요
      </h2>
      <p className="mt-3 text-base leading-relaxed text-chb-muted">
        {basis} 기준이에요.
        {!same && ` 가장 낮은 금리를 받으면 ${formatWon(data.minRatePrice)}까지도 가능하지만 매달 갚는 부담이 커져요.`}
      </p>
      <div className="mt-5 h-3 rounded-full bg-chb-accent/30" aria-hidden="true">
        <div className="h-full rounded-full bg-chb-accent" style={{ width: `${pct}%` }} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-chb-soft2 p-4">
          <dt className="flex items-center gap-2 text-chb-muted"><span aria-hidden="true" className="size-3 rounded-sm bg-chb-accent" />안정 예산 <span className="text-xs">높은 금리 기준</span></dt>
          <dd className="mt-1 font-display text-xl font-black">{formatWon(data.maxRatePrice)}</dd>
          <dd className="text-chb-muted">{loanText(data.maxRateLoan)}</dd>
        </div>
        <div className="rounded-2xl bg-chb-soft2 p-4">
          <dt className="flex items-center gap-2 text-chb-muted"><span aria-hidden="true" className="size-3 rounded-sm bg-chb-accent/30" />최대 예산 <span className="text-xs">낮은 금리 기준</span></dt>
          <dd className="mt-1 font-display text-xl font-black">{formatWon(data.minRatePrice)}</dd>
          <dd className="text-chb-muted">
            {loanText(data.loan.amount)}
            {data.loan.binding && data.loan.amount > 0 && <span className="block text-xs">{BINDING[data.loan.binding]} 적용</span>}
          </dd>
        </div>
      </dl>
    </div>
  );
}

const TOP = 3;
const RATE_TYPE: Record<string, string> = { fixed: "고정", variable: "변동" };

function ProductItem({ p }: { p: ProductPayment }) {
  return (
    <li className="rounded-2xl border border-chb-line p-3">
      <p className="flex items-start justify-between gap-2">
        <span className="font-semibold">{p.provider} <span className="font-normal">{p.name}</span></span>
        {p.rateType && <span className="shrink-0 rounded-full bg-chb-accent-soft px-2 py-0.5 text-xs font-semibold text-chb-accent">{RATE_TYPE[p.rateType] ?? p.rateType}</span>}
      </p>
      <p className="mt-1 text-base font-bold text-chb-ink">
        <span className="sr-only">월 상환액 </span>월 {p.monthlyAtMin === null ? "-" : formatWon(p.monthlyAtMin)}
        {p.monthlyAtMax !== null && p.monthlyAtMax !== p.monthlyAtMin && ` ~ ${formatWon(p.monthlyAtMax)}`}
      </p>
      <p className="text-chb-muted">대출 {formatWon(p.loanAmount)} · {p.termYears}년</p>
    </li>
  );
}

// 많을 때 한눈에 보이도록 월 상환액 적은 순 3개만 펼치고 나머지는 접는다. 순위는 추천이 아니다
function ProductList({ products }: { products: ProductPayment[] }) {
  const sorted = byMonthly(products);
  const rest = sorted.slice(TOP);
  return (
    <div>
      <p className="font-semibold">상품별 월 상환액 <span className="font-normal text-chb-muted">· 월 상환액 적은 순</span></p>
      <p className="mb-2 text-xs text-chb-muted">상품마다 대출액과 기간이 달라 월 상환액만으로 유불리를 판단하기는 어려워요.</p>
      <ul className="space-y-2">{sorted.slice(0, TOP).map((p) => <ProductItem key={p.productId} p={p} />)}</ul>
      {rest.length > 0 && (
        <details className="group mt-2">
          <summary className="cursor-pointer list-none rounded-full py-2 text-center font-semibold text-chb-accent select-none [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">전체 {sorted.length}개 보기 ▾</span>
            <span className="hidden group-open:inline">접기 ▴</span>
          </summary>
          <ul className="space-y-2">{rest.map((p) => <ProductItem key={p.productId} p={p} />)}</ul>
        </details>
      )}
    </div>
  );
}
