import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ToolResult } from "@/lib/agent/tool";
import { AssistantPanel } from "../../_components/AssistantPanel";
import { formatWon } from "../../_components/format";
import { byMonthly, type ProductPayment } from "../../_components/products";
import { getBudgetForPlan } from "../1/actions";
import { DATASETS, ERRORS, NOTICES } from "../../_components/ConditionCheckCard";
import { TipPanel } from "../../_components/TipPanel";
import { favoriteComplexIds } from "../4/actions";
import { changesForPlan, compareForPlan, parseIds } from "./actions";
import { CompareTable, type CompareData } from "./_components/CompareTable";
import { ConditionChanges } from "./_components/ConditionChanges";

// 요청마다 쿠키·DB로 렌더하는 페이지: cacheComponents 프리렌더 대신 요청 시 렌더
export const instant = false;

const COMPARE_NOTICES: Record<string, string> = {
  ...NOTICES,
  complex_not_found: "일부 단지 정보를 찾지 못해 비교에서 뺐습니다.",
  land_share_is_average: "대지지분은 대지면적을 세대수로 나눈 평균 근사치입니다.",
  redevelopment_not_covered: "정비사업 정보는 서울시 자료만 제공합니다. 경기·인천 단지는 해당 지자체에서 확인하세요.",
};

const RATE_TYPE: Record<string, string> = { fixed: "고정", variable: "변동" };
const logError = (e: unknown) => console.error("stage5", e instanceof Error ? `${e.name}: ${e.message}` : e);

export default async function Stage5({
  params, searchParams,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ ids?: string | string[] }>;
}) {
  await connection();
  const { planId } = await params;
  if (!z.uuid().safeParse(planId).success) notFound();
  const { ids: rawIds } = await searchParams;

  const supabase = await createClient();
  const [{ data: tips }, favorites] = await Promise.all([
    supabase.from("tips").select("slug, field_key, title, body, caution").eq("stage", 5).order("sort_order"),
    favoriteComplexIds(planId).catch((e): { complex_id: number; name: string }[] => (logError(e), [])),
  ]);
  const ids = parseIds(rawIds, favorites.map((f) => f.complex_id));
  const [compare, changes, budget] = await Promise.all([
    ids.length >= 2 ? compareForPlan(planId, ids).catch((e): null => (logError(e), null)) : Promise.resolve<ToolResult | null | undefined>(undefined),
    changesForPlan(planId).catch((e): null => (logError(e), null)),
    getBudgetForPlan(planId).catch((e): null => (logError(e), null)),
  ]);
  const budgetData = budget?.data as { products?: ProductPayment[]; loan?: { amount: number } } | undefined;
  const products = byMonthly(budgetData?.products ?? []);

  const data = compare?.data as CompareData | { error: string } | undefined;
  const asOf = Object.entries(compare?.as_of ?? {});
  const stage = (n: number) => <Link href={`/plans/${planId}/stage/${n}`} className="text-blue-700">{n}단계</Link>;
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-4">
      <Link href={`/plans/${planId}/stage/4`} className="text-sm text-blue-700">← 4단계 후보 단지</Link>
      <h1 className="text-lg font-semibold">5단계. 비교하고 결정하기</h1>

      {favorites.length < 2 ? (
        <p className="rounded border p-3 text-sm">비교하려면 {stage(4)}에서 관심 단지(☆)를 2개 이상 저장하세요.</p>
      ) : (
        <form method="get" className="space-y-1 text-sm" aria-label="비교할 관심 단지 선택">
          <p className="font-medium">비교할 관심 단지 (최대 4개, 더 고르면 앞의 4개만 비교합니다)</p>
          <div className="flex flex-wrap gap-3">
            {favorites.map((f) => (
              <label key={f.complex_id} className="flex items-center gap-1">
                <input type="checkbox" name="ids" value={f.complex_id} defaultChecked={ids.includes(f.complex_id)} />
                {f.name}
              </label>
            ))}
          </div>
          <button type="submit" className="rounded border px-2 py-1">비교하기</button>
        </form>
      )}

      {favorites.length >= 2 && (
        compare === undefined ? (
          <p className="rounded border p-3 text-sm">비교할 단지를 2개 이상 고르세요.</p>
        ) : !data ? (
          <p role="alert" className="rounded border p-3 text-sm">비교 결과를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.</p>
        ) : "error" in data ? (
          <p className="rounded border p-3 text-sm">
            {data.error === "need_two_or_more" ? <>비교할 수 있는 단지가 2개 미만입니다. {stage(4)}에서 관심 단지를 더 저장하세요.</>
              : <>{ERRORS[data.error] ?? "비교 결과를 불러오지 못했습니다."} {stage(2)} · {stage(3)}에서 입력하세요.</>}
          </p>
        ) : (
          <section className="space-y-2" aria-label="관심 단지 비교">
            <CompareTable planId={planId} data={data} tips={tips ?? []} />
            {compare?.notices?.filter((n) => COMPARE_NOTICES[n]).map((n) => <p key={n} className="text-xs text-gray-600">{COMPARE_NOTICES[n]}</p>)}
            {compare?.stale?.length ? <p role="alert" className="rounded bg-yellow-100 p-2 text-xs text-yellow-900">오래된 데이터가 포함되어 있습니다: {compare.stale.map((k) => DATASETS[k] ?? k).join(", ")}</p> : null}
            {asOf.length > 0 && <p className="text-xs text-gray-600">데이터 기준일: {asOf.map(([k, v]) => `${DATASETS[k] ?? k} ${v}`).join(" · ")}</p>}
          </section>
        )
      )}

      {products.length > 0 && (
        // 상품이 수십 개라 접어 두고, 펼치면 한 줄씩 표로 본다
        <details className="rounded border p-3 text-sm" aria-label="대출 상품 비교">
          <summary className="cursor-pointer font-semibold">대출 상품 전체 비교 <span className="font-normal text-gray-600">· {products.length}개, 월 상환액 적은 순</span></summary>
          <p className="mt-2 text-xs text-gray-600">
            1단계 예산의 대출 가능액 {formatWon(budgetData?.loan?.amount ?? 0)} 기준이에요. 상품마다 대출액과 기간이 달라 월 상환액만으로 유불리를 판단하기는 어려워요. 순위는 추천이 아닙니다.
          </p>
          {budget?.notices?.includes("dummy_data:loan_products:bank") && <p role="alert" className="mt-2 rounded bg-red-50 p-2 font-bold text-red-800">은행 상품 금리는 테스트용 가짜 데이터입니다</p>}
          <div className="mt-2 max-h-[28rem] overflow-auto">
            <table className="w-full min-w-[32rem] border-collapse">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-gray-700">
                  <th scope="col" className="border-b p-2 font-normal">은행 · 상품</th>
                  <th scope="col" className="border-b p-2 font-normal">금리</th>
                  <th scope="col" className="border-b p-2 font-normal">월 상환액</th>
                  <th scope="col" className="border-b p-2 font-normal">대출 · 기간</th>
                </tr>
              </thead>
              <tbody>
                {products.map((x) => (
                  <tr key={x.productId}>
                    <td className="border-b p-2"><span className="font-semibold">{x.provider}</span> {x.name}</td>
                    <td className="border-b p-2">{RATE_TYPE[x.rateType ?? ""] ?? "-"}</td>
                    <td className="border-b p-2 font-semibold whitespace-nowrap">
                      {x.monthlyAtMin === null ? "-" : formatWon(x.monthlyAtMin)}
                      {x.monthlyAtMax !== null && x.monthlyAtMax !== x.monthlyAtMin && ` ~ ${formatWon(x.monthlyAtMax)}`}
                    </td>
                    <td className="border-b p-2 whitespace-nowrap text-gray-700">{formatWon(x.loanAmount)} · {x.termYears}년</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {budget?.as_of["loan_products:bank"] && <p className="mt-2 text-xs text-gray-600">데이터 기준일: 시중은행 상품 {budget.as_of["loan_products:bank"]}</p>}
        </details>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <ConditionChanges planId={planId} result={changes} />
          <section className="space-y-1 rounded border p-3 text-sm" aria-label="구매 전 확인과 다음 절차">
            <h2 className="font-semibold">구매 전에 확인할 것</h2>
            <TipPanel tips={tips ?? []} fieldKey="checklist" />
            <h2 className="pt-2 font-semibold">다음 절차</h2>
            <TipPanel tips={tips ?? []} fieldKey="next_steps" />
            <h2 className="pt-2 font-semibold">정비구역 단지라면</h2>
            <TipPanel tips={tips ?? []} fieldKey="redevelopment" />
          </section>
        </div>
        <AssistantPanel planId={planId} stage={5} />
      </div>
      <p><Link href={`/plans/${planId}/report`} className="text-blue-700">구매 검토 리포트 만들기 →</Link></p>
    </main>
  );
}
