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
import { TipCards } from "../../_components/TipCards";
import { Section } from "../../_components/Field";
import { StageTabs } from "../../_components/StageTabs";
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
  const stage = (n: number) => <Link href={`/plans/${planId}/stage/${n}`} className="font-semibold text-chb-accent hover:underline">{n}단계</Link>;
  const box = "rounded-3xl border border-chb-line bg-white p-6 text-chb-muted";
  const compared = data && !("error" in data) ? data.items.length : 0;
  return (
    <div className="flex-1 bg-chb-soft2 pb-28">
      <StageTabs planId={planId} current={5} />
      <main className="mx-auto w-full max-w-6xl space-y-8 px-6 py-10">
        <section className="space-y-4" aria-label="관심 단지 비교">
          <h1 className="font-display text-3xl font-black tracking-tight text-chb-ink">5단계. 비교하고 결정하기</h1>
          {favorites.length >= 2 && (
            <p className="-mt-2 text-lg text-chb-muted">
              관심 단지 <b className="text-chb-ink">{favorites.length}곳</b>{compared ? <> 중 {compared}곳을 나란히 비교해요</> : null}. 항목마다 나은 단지에 &lsquo;유리&rsquo;를 표시했어요.
            </p>
          )}

          {favorites.length < 2 ? (
            <p className={box}>비교하려면 {stage(4)}에서 관심 단지(☆)를 2개 이상 저장하세요.</p>
          ) : (
            <form method="get" className="rounded-3xl border border-chb-line bg-white p-6" aria-label="비교할 관심 단지 선택">
              <p className="font-semibold text-chb-ink">비교할 관심 단지 <span className="font-normal text-chb-muted">· 최대 4개, 더 고르면 앞의 4개만 비교합니다</span></p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {favorites.map((f) => (
                  <label key={f.complex_id} className="flex cursor-pointer items-center gap-2 rounded-full border-2 border-chb-line bg-white px-4 py-2 text-sm font-semibold transition hover:border-chb-accent/50 has-checked:border-chb-accent has-checked:bg-chb-soft2 has-focus-visible:ring-4 has-focus-visible:ring-chb-accent-soft">
                    <input type="checkbox" name="ids" value={f.complex_id} defaultChecked={ids.includes(f.complex_id)} className="size-4 accent-chb-accent" />
                    {f.name}
                  </label>
                ))}
                <button type="submit" className="rounded-full bg-chb-accent px-5 py-2 text-sm font-bold text-white transition hover:bg-chb-accent/90">비교하기</button>
              </div>
            </form>
          )}

          {favorites.length >= 2 && (
            compare === undefined ? (
              <p className={box}>비교할 단지를 2개 이상 고르세요.</p>
            ) : !data ? (
              <p role="alert" className={box}>비교 결과를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.</p>
            ) : "error" in data ? (
              <p className={box}>
                {data.error === "need_two_or_more" ? <>비교할 수 있는 단지가 2개 미만입니다. {stage(4)}에서 관심 단지를 더 저장하세요.</>
                  : <>{ERRORS[data.error] ?? "비교 결과를 불러오지 못했습니다."} {stage(2)} · {stage(3)}에서 입력하세요.</>}
              </p>
            ) : (
              <>
                {compare?.stale?.length ? <p role="alert" className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">오래된 데이터가 포함되어 있습니다: {compare.stale.map((k) => DATASETS[k] ?? k).join(", ")}</p> : null}
                <CompareTable planId={planId} data={data} tips={tips ?? []} />
                {!!compare?.notices?.filter((n) => COMPARE_NOTICES[n]).length && (
                  <ul className="list-disc space-y-1 pl-5 text-xs text-chb-muted">
                    {compare.notices.filter((n) => COMPARE_NOTICES[n]).map((n) => <li key={n}>{COMPARE_NOTICES[n]}</li>)}
                  </ul>
                )}
                {asOf.length > 0 && <p className="text-xs text-chb-muted">데이터 기준일: {asOf.map(([k, v]) => `${DATASETS[k] ?? k} ${v}`).join(" · ")}</p>}
              </>
            )
          )}
        </section>

        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            {products.length > 0 && (
              // 상품이 수십 개라 접어 두고, 펼치면 한 줄씩 표로 본다
              <details className="group rounded-3xl border border-chb-line bg-white p-6 text-sm" aria-label="대출 상품 비교">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                  <span>
                    <span className="block font-display text-xl font-black tracking-tight text-chb-ink">대출 상품 전체 비교</span>
                    <span className="text-chb-muted">{products.length}개, 월 상환액 적은 순</span>
                  </span>
                  <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-chb-soft text-chb-accent transition group-open:rotate-180">▾</span>
                </summary>
                <p className="mt-4 text-xs text-chb-muted">
                  1단계 예산의 대출 가능액 {formatWon(budgetData?.loan?.amount ?? 0)} 기준이에요. 상품마다 대출액과 기간이 달라 월 상환액만으로 유불리를 판단하기는 어려워요. 순위는 추천이 아닙니다.
                </p>
                {budget?.notices?.includes("dummy_data:loan_products:bank") && <p role="alert" className="mt-3 rounded-2xl bg-red-50 p-3 font-bold text-red-800">은행 상품 금리는 테스트용 가짜 데이터입니다</p>}
                <div className="mt-3 max-h-[28rem] overflow-auto rounded-2xl border border-chb-line">
                  <table className="w-full min-w-[32rem] border-collapse">
                    <thead className="sticky top-0 bg-chb-soft2">
                      <tr className="text-left text-chb-muted">
                        <th scope="col" className="p-3 font-semibold">은행 · 상품</th>
                        <th scope="col" className="p-3 font-semibold">금리</th>
                        <th scope="col" className="p-3 font-semibold">월 상환액</th>
                        <th scope="col" className="p-3 font-semibold">대출 · 기간</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((x) => (
                        <tr key={x.productId} className="border-t border-chb-line">
                          <td className="p-3"><span className="font-semibold text-chb-ink">{x.provider}</span> <span className="text-chb-muted">{x.name}</span></td>
                          <td className="p-3 text-chb-muted">{RATE_TYPE[x.rateType ?? ""] ?? "-"}</td>
                          <td className="p-3 font-bold whitespace-nowrap text-chb-ink">
                            {x.monthlyAtMin === null ? "-" : formatWon(x.monthlyAtMin)}
                            {x.monthlyAtMax !== null && x.monthlyAtMax !== x.monthlyAtMin && ` ~ ${formatWon(x.monthlyAtMax)}`}
                          </td>
                          <td className="p-3 whitespace-nowrap text-chb-muted">{formatWon(x.loanAmount)} · {x.termYears}년</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {budget?.as_of["loan_products:bank"] && <p className="mt-3 text-xs text-chb-muted">데이터 기준일: 시중은행 상품 {budget.as_of["loan_products:bank"]}</p>}
              </details>
            )}

            <ConditionChanges planId={planId} result={changes} />

            <Section n={1} heading="구매 전에 확인할 것" desc="계약금을 내기 전에 서류와 실제 대출 한도를 확인해요.">
              <TipCards tips={(tips ?? []).filter((x) => x.field_key === "checklist")} />
            </Section>
            <Section n={2} heading="다음 절차" desc="매물 확인부터 잔금·등기, 전입 신고까지의 순서예요.">
              <TipCards tips={(tips ?? []).filter((x) => x.field_key === "next_steps")} />
            </Section>
            <Section n={3} heading="정비구역 단지라면" desc="재건축·재개발 구역 안 단지는 따로 살펴볼 것이 있어요.">
              <TipCards tips={(tips ?? []).filter((x) => x.field_key === "redevelopment")} />
            </Section>
          </div>
          <div className="lg:sticky lg:top-24">
            <AssistantPanel planId={planId} stage={5} />
          </div>
        </div>
      </main>
      <div className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2">
        <Link href={`/plans/${planId}/report`}
          className="flex items-center gap-5 whitespace-nowrap rounded-full bg-chb-ink py-2.5 pr-2.5 pl-7 text-white shadow-[0_18px_40px_-12px_rgba(20,32,26,0.55)] transition hover:-translate-y-0.5">
          <span>
            <span className="block text-xs text-white/70">비교를 마쳤다면</span>
            <span className="block text-lg font-bold">구매 검토 리포트 만들기</span>
          </span>
          <span aria-hidden="true" className="grid size-11 place-items-center rounded-full bg-white/15 text-lg">→</span>
        </Link>
      </div>
    </div>
  );
}

