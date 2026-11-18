import Link from "next/link";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ReportPayload } from "@/lib/report/assemble";
import { BudgetCard } from "../_components/BudgetCard";
import { DATASETS, NOTICES } from "../_components/ConditionCheckCard";
import { formatWon } from "../_components/format";
import { CompareTable, type CompareData } from "../stage/5/_components/CompareTable";
import { createReport, generateNarrative, type NarrativeError } from "./actions";
import { PrintButton } from "./_components/PrintButton";

// 요청마다 쿠키·DB로 렌더하는 페이지: cacheComponents 프리렌더 대신 요청 시 렌더
export const instant = false;

const REPORT_NOTICES: Record<string, string> = {
  ...NOTICES,
  need_two_favorites: "관심 단지가 2개 미만이라 비교 표를 넣지 않았습니다. 4단계에서 관심 단지를 저장하세요.",
  land_share_is_average: "대지지분은 대지면적을 세대수로 나눈 평균 근사치입니다.",
};

const NARRATIVE_ERRORS: Record<NarrativeError, string> = {
  no_report: "리포트를 먼저 만들어 주세요.",
  rate_limited: "오늘 AI 사용 한도를 다 썼습니다. 내일 다시 시도해 주세요.",
  llm_quota: "AI 사용량이 많아 잠시 후 다시 시도해 주세요.",
  llm_unavailable: "AI 해설을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.",
  narrative_has_numbers: "AI가 표에 없는 숫자를 써서 해설을 저장하지 않았습니다. 다시 시도해 주세요.",
};

export default async function Report({ params, searchParams }: {
  params: Promise<{ planId: string }>; searchParams: Promise<{ narrative_error?: string }>;
}) {
  await connection();
  const { planId } = await params;
  const narrativeError = NARRATIVE_ERRORS[(await searchParams).narrative_error as NarrativeError];
  if (!z.uuid().safeParse(planId).success) notFound();

  const supabase = await createClient();
  const { data: latest } = await supabase.from("reports").select("payload, narrative, created_at")
    .eq("plan_id", planId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const p = latest?.payload as unknown as ReportPayload | undefined;

  async function make() {
    "use server";
    await createReport(planId);
    redirect(`/plans/${planId}/report`);
  }
  async function explain() {
    "use server";
    const err = await generateNarrative(planId);
    redirect(`/plans/${planId}/report${err ? `?narrative_error=${err}` : ""}`);
  }

  const compare = p?.compare?.data as CompareData | { error: string } | undefined;
  const c = p?.conditions;
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-4 print:p-0">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link href={`/plans/${planId}/stage/5`} className="text-sm text-blue-700">← 5단계 비교</Link>
        <form action={make}><button type="submit" className="rounded bg-foreground px-3 py-1 text-background">{p ? "다시 만들기" : "리포트 만들기"}</button></form>
        {p && <PrintButton />}
      </div>
      <h1 className="text-lg font-semibold">구매 검토 리포트</h1>
      <p className="rounded bg-gray-100 p-2 text-sm">
        모든 금액은 공개 데이터와 입력값으로 계산한 추정치입니다. 이 리포트는 매수를 권하거나 말리지 않으며, 실제 대출·세금·가격은 은행·세무사·계약서로 확인해야 합니다.
      </p>
      {!p ? (
        <p className="rounded border p-3 text-sm">아직 만든 리포트가 없습니다. 지금까지 입력한 내용으로 리포트를 만들 수 있습니다.</p>
      ) : (
        <>
          <p className="text-sm text-gray-600">작성일 {p.generated_on}</p>
          <section className="space-y-1 rounded border p-4 text-sm" aria-label="희망 조건">
            <h2 className="font-semibold">희망 조건</h2>
            {c ? (
              <ul className="list-disc pl-5">
                <li>희망 지역: {c.region_names.join(", ") || "-"}</li>
                {c.region_reason && <li>선호 이유: {c.region_reason}</li>}
                {c.commute_region_name && <li>직장·주요 이동 지역: {c.commute_region_name}</li>}
                <li>희망 전용면적: {c.area_min ?? "-"} ~ {c.area_max ?? "-"}㎡</li>
                {c.price_max !== null && <li>희망 최고가: {formatWon(c.price_max)}</li>}
                {c.redevelopment_interest && <li>재건축·재개발에 관심 있음</li>}
              </ul>
            ) : <p>2·3단계 조건을 저장하지 않았습니다.</p>}
          </section>
          <BudgetCard result={p.budget} />
          <section className="space-y-2" aria-label="관심 단지 비교">
            <h2 className="font-semibold">관심 단지 비교 ({p.favorites.map((f) => f.name).join(", ") || "없음"})</h2>
            {compare && !("error" in compare) ? <CompareTable planId={planId} data={compare} tips={[]} />
              : compare ? <p className="text-sm">비교 결과를 만들지 못했습니다.</p> : null}
          </section>
          <section className="space-y-2 rounded border p-4 text-sm" aria-label="구매 전 확인과 다음 절차">
            <h2 className="font-semibold">구매 전 확인과 다음 절차</h2>
            {p.checklist.map((t) => (
              <div key={t.title}>
                <h3 className="font-medium">{t.title}</h3>
                <p className="whitespace-pre-line">{t.body}</p>
                {t.caution && <p className="text-gray-700">알아두기: {t.caution}</p>}
              </div>
            ))}
          </section>
          <section className="rounded border p-4 text-sm" aria-label="AI 해설">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold">AI 해설</h2>
              <form action={explain} className="print:hidden">
                <button type="submit" className="rounded border px-2 py-0.5 text-xs">{latest?.narrative ? "AI 해설 다시 만들기" : "AI 해설 만들기"}</button>
              </form>
            </div>
            {narrativeError && <p role="alert" className="text-red-700 print:hidden">{narrativeError}</p>}
            <p className="whitespace-pre-line">{latest?.narrative ?? "아직 AI 해설이 없습니다. 버튼을 누르면 위 리포트 내용을 쉬운 말로 풀어 드립니다."}</p>
            {latest?.narrative && <p className="mt-2 text-xs text-gray-600">AI 해설은 위 표를 말로 풀어 쓴 참고 글입니다. 숫자와 판단 근거는 위 표가 기준입니다.</p>}
          </section>
          {p.notices.filter((n) => REPORT_NOTICES[n]).map((n) => <p key={n} className="text-xs text-gray-600">{REPORT_NOTICES[n]}</p>)}
          {Object.keys(p.as_of).length > 0 && (
            <p className="text-xs text-gray-600">데이터 기준일: {Object.entries(p.as_of).map(([k, v]) => `${DATASETS[k] ?? k} ${v}`).join(" · ")}</p>
          )}
        </>
      )}
    </main>
  );
}
