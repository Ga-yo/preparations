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
import { createReport } from "./actions";
import { PrintButton } from "./_components/PrintButton";
import { Section } from "../_components/Field";
import { StageTabs } from "../_components/StageTabs";
import { TipCards } from "../_components/TipCards";

// 요청마다 쿠키·DB로 렌더하는 페이지: cacheComponents 프리렌더 대신 요청 시 렌더
export const instant = false;

const REPORT_NOTICES: Record<string, string> = {
  ...NOTICES,
  need_two_favorites: "관심 단지가 2개 미만이라 비교 표를 넣지 않았습니다. 4단계에서 관심 단지를 저장하세요.",
  land_share_is_average: "대지지분은 대지면적을 세대수로 나눈 평균 근사치입니다.",
};

export default async function Report({ params }: { params: Promise<{ planId: string }> }) {
  await connection();
  const { planId } = await params;
  if (!z.uuid().safeParse(planId).success) notFound();

  const supabase = await createClient();
  const { data: latest } = await supabase.from("reports").select("payload, narrative, created_at")
    .eq("plan_id", planId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const p = latest?.payload as unknown as ReportPayload | undefined;
  // 리포트를 만들기 전에도 고정 안내(계약 서류·절차·정비구역)는 바로 보여 준다. 만든 뒤에는 스냅숏 그대로
  const { data: liveTips } = p ? { data: null } : await supabase.from("tips").select("slug, field_key, title, body, caution")
    .eq("stage", 5).in("field_key", ["checklist", "next_steps", "redevelopment"]).order("sort_order");
  const tipsOf = (k: string) => (liveTips ?? []).filter((x) => x.field_key === k);

  async function make() {
    "use server";
    await createReport(planId);
    redirect(`/plans/${planId}/report`);
  }

  const compare = p?.compare?.data as CompareData | { error: string } | undefined;
  const c = p?.conditions;
  const fact = (k: string, v: React.ReactNode) => (
    <div className="rounded-xl bg-chb-soft2 px-4 py-3">
      <dt className="text-xs text-chb-muted">{k}</dt>
      <dd className="mt-0.5 font-semibold text-chb-ink">{v}</dd>
    </div>
  );
  return (
    <div className="flex-1 bg-chb-soft2 pb-16 print:bg-white print:pb-0">
      <div className="print:hidden"><StageTabs planId={planId} current="report" /></div>
      <main className="mx-auto w-full max-w-5xl space-y-8 px-6 py-10 print:max-w-none print:space-y-6 print:p-0">
        <header className="rounded-3xl border border-chb-line bg-white p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-chb-accent">{p ? `작성일 ${p.generated_on}` : "채비 리포트"}</p>
              <h1 className="mt-1 font-display text-3xl font-black tracking-tight text-chb-ink">구매 검토 리포트</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <form action={make}>
                <button type="submit" className="rounded-full bg-chb-accent px-5 py-2.5 text-sm font-bold text-white transition hover:bg-chb-accent/90">{p ? "다시 만들기" : "리포트 만들기"}</button>
              </form>
              {p && <PrintButton />}
            </div>
          </div>
          <p className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
            모든 금액은 공개 데이터와 입력값으로 계산한 추정치입니다. 이 리포트는 매수를 권하거나 말리지 않으며, 실제 대출·세금·가격은 은행·세무사·계약서로 확인해야 합니다.
          </p>
        </header>
        {!p ? (
          <>
            <p className="rounded-3xl border border-chb-line bg-white p-6 text-center text-chb-muted">
              아직 만든 리포트가 없습니다. &lsquo;리포트 만들기&rsquo;를 누르면 희망 조건·예산·관심 단지 비교가 함께 담겨요.<br />
              그 전에 계약 전 확인할 것과 구매 절차는 아래에서 바로 볼 수 있어요.
            </p>
            <Section n={1} heading="구매 전에 확인할 것" desc="계약금을 내기 전에 서류와 실제 대출 한도를 확인해요.">
              <TipCards tips={tipsOf("checklist")} />
            </Section>
            <Section n={2} heading="다음 절차" desc="매물 확인부터 잔금·등기, 전입 신고까지의 순서예요.">
              <TipCards tips={tipsOf("next_steps")} />
            </Section>
            <Section n={3} heading="관심 단지가 정비구역 안에 있다면" desc="재건축·재개발 구역 안 단지는 따로 확인할 것이 있어요. 리포트를 만들면 해당 단지가 있을 때만 담겨요.">
              <TipCards tips={tipsOf("redevelopment")} />
            </Section>
          </>
        ) : (
          <>
            <Section n={1} heading="희망 조건" desc="2·3단계에서 저장한 조건이에요.">
              {c ? (
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  {fact("희망 지역", c.region_names.join(", ") || "-")}
                  {fact("희망 전용면적", `${c.area_min ?? "-"} ~ ${c.area_max ?? "-"}㎡`)}
                  {c.price_max !== null && fact("희망 최고가", formatWon(c.price_max))}
                  {c.commute_region_name && fact("직장·주요 이동 지역", c.commute_region_name)}
                  {c.region_reason && fact("선호 이유", c.region_reason)}
                  {c.redevelopment_interest && fact("재건축·재개발", "관심 있음")}
                </dl>
              ) : <p className="text-chb-muted">2·3단계 조건을 저장하지 않았습니다.</p>}
            </Section>

            <Section n={2} heading="구매 가능 예산" desc="1단계 입력과 규제 기준으로 계산한 예산과 부대비용이에요.">
              {p.region_budgets?.length ? p.region_budgets.map((g) => (
                <div key={g.region_names.join(",")} className="space-y-2" aria-label="지역별 예산">
                  <h3 className="font-semibold text-chb-ink">예산 기준 지역 <span className="font-normal text-chb-muted">· {g.region_names.join(", ")}</span></h3>
                  <div className="rounded-2xl border border-chb-line"><BudgetCard result={g.budget} detail flat /></div>
                </div>
              )) : <div className="rounded-2xl border border-chb-line"><BudgetCard result={p.budget} detail flat /></div>}
            </Section>

            <Section n={3} heading="관심 단지 비교" desc={p.favorites.length ? `${p.favorites.map((f) => f.name).join(", ")}` : "저장한 관심 단지가 없어요."}>
              {compare && !("error" in compare) ? <CompareTable planId={planId} data={compare} tips={[]} />
                : compare ? <p className="text-chb-muted">비교 결과를 만들지 못했습니다.</p>
                : <p className="text-chb-muted">관심 단지가 2개 이상이면 비교 표가 들어가요.</p>}
            </Section>

            <Section n={4} heading="구매 전 확인과 다음 절차" desc="계약 전에 확인할 서류와 구매 순서예요. 관심 단지에 정비구역 안 단지가 있으면 정비구역 안내도 담아요.">
              <TipCards tips={p.checklist} />
            </Section>

            <Section n={5} heading="AI 해설" desc="5단계 AI 점검 결과예요. 숫자는 위 표가 기준이며, AI 해설은 참고용입니다.">
              {latest?.narrative ? (
                <p className="whitespace-pre-line rounded-2xl bg-chb-soft2 p-5 text-sm leading-relaxed text-chb-ink">{latest.narrative}</p>
              ) : (
                <p className="text-chb-muted">
                  리포트를 만들 때의 입력으로 받은 5단계 AI 점검이 없습니다.{" "}
                  <Link href={`/plans/${planId}/stage/5`} className="font-semibold text-chb-accent hover:underline print:hidden">5단계에서 AI 점검 받기</Link>
                  <span className="print:hidden"> 후 리포트를 다시 만들면 여기에 담깁니다.</span>
                </p>
              )}
            </Section>

            <footer className="space-y-1 text-xs text-chb-muted">
              {p.notices.filter((n) => REPORT_NOTICES[n]).map((n) => <p key={n}>{REPORT_NOTICES[n]}</p>)}
              {Object.keys(p.as_of).length > 0 && (
                <p>데이터 기준일: {Object.entries(p.as_of).map(([k, v]) => `${DATASETS[k] ?? k} ${v}`).join(" · ")}</p>
              )}
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
