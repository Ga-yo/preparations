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
const PURPOSE: Record<string, string> = { live: "실거주", invest: "투자", both: "실거주 및 투자" };
const TIMELINE: Record<string, string> = { "6m": "6개월 이내", "1y": "1년 이내", "2_3y": "2~3년 이내", undecided: "미정" };
const PROFILE_NOTICES: Record<string, string> = {
  invest_not_supported: "투자 수익(전세가율·임대수익) 분석은 제공하지 않습니다. 예산은 실거주와 같은 기준으로 계산했습니다.",
  recheck_regulation: "구매까지 시간이 남아 있습니다. 그 사이 대출 규제와 시세가 바뀔 수 있으니 구매 직전에 다시 확인하세요.",
};
type Summary = { purpose: string | null; timeline: string | null; income_is_combined: boolean | null };
const BINDING = { ltv: "LTV 한도", loan_cap: "한도 상한", dsr: "DSR 한도" } as const;
const ERRORS: Record<string, string> = {
  profile_missing: "왼쪽 폼을 저장하면 예산이 계산됩니다.",
  region_ambiguous: "지역명이 여러 곳과 일치합니다.",
  region_not_found: "지역을 찾지 못했습니다.",
};

type Data = (Omit<BudgetResult, "loan"> & { loan: { amount: number; binding?: keyof typeof BINDING }; profile_summary?: Summary }) | { error: string };

// 최대 예산 카드에 "DSR 한도 적용"처럼 이미 나오는 진단. 요약 화면에서는 다시 쓰지 않는다
const CARD_DIAGNOSES: Diagnosis[] = ["dsr_binding", "ltv_binding", "cap_binding"];

// flat: 팝업 안에 넣을 때 카드 테두리 없이. income(원): 설명 문장용. 툴 결과에는 소득 원값을 넣지 않아 화면이 따로 넘긴다
// detail: 리포트용. 부대비용 내역·상품 전체·진단 전체를 펼친다. 1단계는 요약만 두고 나머지는 5단계에서 본다
export function BudgetCard({ result, flat = false, income, detail = false }: { result: ToolResult; flat?: boolean; income?: number | null; detail?: boolean }) {
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
        // 팝업(flat)은 넓은 화면에서 두 칸: 왼쪽은 답(예산·전제), 오른쪽은 근거(상품·부대비용·진단). 스크롤 없이 보이게
        <div className={`text-sm ${flat ? "grid gap-x-8 gap-y-4 md:grid-cols-2" : "space-y-4"}`}>
          <div className="space-y-4">
          <BudgetHeadline data={data} income={income} />
          {/* 헤드라인 숫자의 전제라 숫자 바로 아래에 둔다 */}
          {data.diagnoses.includes("region_unspecified") && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900">{DIAGNOSES.region_unspecified}</p>
          )}
          {data.profile_summary && (
            <p className="text-chb-muted">
              {[data.profile_summary.purpose && `목적 ${PURPOSE[data.profile_summary.purpose]}`,
                data.profile_summary.timeline && `희망 시기 ${TIMELINE[data.profile_summary.timeline]}`,
                data.profile_summary.income_is_combined && "소득은 부부 합산 기준"].filter(Boolean).join(" · ")}
            </p>
          )}
          {result.notices?.filter((n) => PROFILE_NOTICES[n]).map((n) => <p key={n} className="rounded-xl bg-chb-soft2 p-3 text-chb-ink">{PROFILE_NOTICES[n]}</p>)}
          </div>
          <div className="space-y-4">
          {data.products.length > 0 && <ProductList products={data.products} all={detail} />}
          {detail ? (
            <div>
              <p className="font-semibold">부대비용: 총 {formatWon(data.costs.total)}</p>
              <ul className="list-disc pl-5">
                <li>취득세 {formatWon(data.costs.acquisitionTax)}</li>
                <li>중개보수 {formatWon(data.costs.brokerage)}</li>
              </ul>
              <p className="text-chb-muted">중개보수는 상한 요율 기준, 부가세 별도입니다.</p>
            </div>
          ) : (
            // 예산 계산식이 부대비용을 빼므로 총액은 남긴다. 후보별 내역은 5단계 비교표
            <p className="text-chb-muted">취득세·중개보수 등 부대비용 약 {formatWon(data.costs.total)}을 빼고 계산했어요. 단지별 금액은 5단계 비교에서 볼 수 있어요.</p>
          )}
          <Diagnoses list={data.diagnoses.filter((d) => d !== "region_unspecified")} detail={detail} />
          </div>
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

// '대출 없이 계산' 안내만 보이고, 카드에 나온 한도 진단은 빼고, 나머지 주의사항은 접는다(리포트는 모두 펼침)
function Diagnoses({ list, detail }: { list: Diagnosis[]; detail: boolean }) {
  if (!list.length) return null;
  const items = (ds: Diagnosis[]) => <ul className="list-disc space-y-1 pl-5 text-chb-muted">{ds.map((d) => <li key={d}>{DIAGNOSES[d]}</li>)}</ul>;
  if (detail) return items(list);
  const main = list.filter((d) => d === "funds_only");
  const rest = list.filter((d) => d !== "funds_only" && !CARD_DIAGNOSES.includes(d));
  if (!main.length && !rest.length) return null;
  return (
    <div>
      {items(main)}
      {rest.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-chb-muted">주의사항 {rest.length}개 보기</summary>
          {items(rest)}
        </details>
      )}
    </div>
  );
}

type Budget = Exclude<Data, { error: string }>;
const loanText = (n: number) => (n > 0 ? <>대출 <span className="whitespace-nowrap">{formatWon(n)}</span></> : "대출 없이 내 돈으로만");

// 두 금리 조건의 예산을 나란히: 안정 = 가장 높은 금리 기준(maxRatePrice), 최대 = 가장 낮은 금리 기준(minRatePrice)
function BudgetHeadline({ data, income }: { data: Budget; income?: number | null }) {
  const basis = [income ? `연소득 ${formatWon(income)}` : null, `구매에 쓸 수 있는 내 돈 ${formatWon(data.ownFunds)}`].filter(Boolean).join(", ");
  return (
    <div>
      <h2 className="font-display text-2xl sm:text-3xl leading-tight font-black tracking-tight text-chb-ink">
        금리가 올라도 살 수 있는 집값은<br />
        <span className="whitespace-nowrap text-chb-accent">{formatWon(data.maxRatePrice)}</span>까지예요
      </h2>
      <p className="mt-3 text-base leading-relaxed text-chb-muted">
        {basis} 기준이에요.
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-chb-soft2 p-4">
          <dt className="flex flex-wrap items-baseline gap-x-2 text-chb-muted">안정 예산 <span className="text-xs whitespace-nowrap">높은 금리 기준</span></dt>
          <dd className="mt-1 font-display text-lg sm:text-xl font-black whitespace-nowrap">{formatWon(data.maxRatePrice)}</dd>
          <dd className="text-chb-muted">{loanText(data.maxRateLoan)}</dd>
        </div>
        <div className="rounded-2xl bg-chb-soft2 p-4">
          <dt className="flex flex-wrap items-baseline gap-x-2 text-chb-muted">최대 예산 <span className="text-xs whitespace-nowrap">낮은 금리 기준</span></dt>
          <dd className="mt-1 font-display text-lg sm:text-xl font-black whitespace-nowrap">{formatWon(data.minRatePrice)}</dd>
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

// 대출액·기간이 모든 상품에서 같으면(대부분) 제목에 한 번만 쓰고 줄마다 반복하지 않는다
function ProductItem({ p, showLoan }: { p: ProductPayment; showLoan: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <span className="min-w-0">
        <span className="font-semibold">{p.provider}</span> {p.name}
        {p.rateType && <span className="ml-1.5 rounded-full bg-chb-accent-soft px-2 py-0.5 text-xs font-semibold text-chb-accent">{RATE_TYPE[p.rateType] ?? p.rateType}</span>}
        {showLoan && <span className="block text-chb-muted">대출 {formatWon(p.loanAmount)} · {p.termYears}년</span>}
      </span>
      <span className="shrink-0 text-right text-base font-bold whitespace-nowrap text-chb-ink">
        <span className="sr-only">월 상환액 </span>월 {p.monthlyAtMin === null ? "-" : formatWon(p.monthlyAtMin)}
        {p.monthlyAtMax !== null && p.monthlyAtMax !== p.monthlyAtMin && <span className="block text-xs font-normal text-chb-muted">최고 금리 {formatWon(p.monthlyAtMax)}</span>}
      </span>
    </li>
  );
}

// 1단계는 월 상환액 적은 순 3개만, 나머지는 5단계에서 고른다. all(리포트)이면 나머지를 접어서 함께. 순위는 추천이 아니다
// 상품 대출액은 낮은 금리 기준 대출 가능액(최대 예산 쪽)이라 헤드라인(안정 예산)과 다르다는 것을 제목에 밝힌다
function ProductList({ products, all }: { products: ProductPayment[]; all: boolean }) {
  const sorted = byMonthly(products);
  const rest = all ? sorted.slice(TOP) : [];
  const same = sorted.every((p) => p.loanAmount === sorted[0].loanAmount && p.termYears === sorted[0].termYears);
  const list = (ps: ProductPayment[]) => <ul className="divide-y divide-chb-line">{ps.map((p) => <ProductItem key={p.productId} p={p} showLoan={!same} />)}</ul>;
  return (
    <div>
      <p className="font-semibold">상품별 월 상환액 <span className="font-normal text-chb-muted">· 적은 순</span></p>
      <p className="text-xs text-chb-muted">
        최대 예산 기준{same && ` · 대출 ${formatWon(sorted[0].loanAmount)} · ${sorted[0].termYears}년`}. 상품마다 조건이 달라 월 상환액만으로 유불리를 판단하기는 어려워요.
      </p>
      {list(sorted.slice(0, TOP))}
      {!all && sorted.length > TOP && <p className="text-xs text-chb-muted">나머지 {sorted.length - TOP}개 상품은 5단계에서 비교할 수 있어요.</p>}
      {rest.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none rounded-full py-2 text-center font-semibold text-chb-accent select-none [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">전체 {sorted.length}개 보기 ▾</span>
            <span className="hidden group-open:inline">접기 ▴</span>
          </summary>
          {list(rest)}
        </details>
      )}
    </div>
  );
}
