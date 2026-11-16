import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { BudgetCard } from "../../_components/BudgetCard";
import { ChatPanel } from "../../_components/ChatPanel";
import { MoneyInput } from "../../_components/MoneyInput";
import { StageForm } from "../../_components/StageForm";
import { TipPanel } from "../../_components/TipPanel";
import { getBudgetForPlan, saveFinancialProfile } from "./actions";

const LABELS: Record<string, string> = {
  purpose: "구매 목적", timeline: "구매 희망 시기", cash_assets: "보유 현금·자기자본", annual_income: "연 소득",
  existing_debt: "기존 대출·부채 총액", existing_debt_annual_payment: "기존 대출 연간 원리금 상환액",
  extra_funds: "추가 가용 자금", owned_house_count: "보유 주택 수", plan: "계획(접근 권한 없음 또는 존재하지 않음)",
};
// 요청마다 쿠키·DB로 렌더하는 페이지: cacheComponents 프리렌더 대신 요청 시 렌더
export const instant = false;

const MAN = (v: number | null | undefined) => (v == null ? null : v / 10_000);

export default async function Stage1({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  await connection(); // 날짜·쿠키 기반 렌더: 프리렌더 대상에서 제외
  const { planId } = await params;
  if (!z.uuid().safeParse(planId).success) notFound();
  const supabase = await createClient();
  const [{ data: p }, { data: tips }, budget] = await Promise.all([
    supabase.from("financial_profiles").select("*").eq("plan_id", planId).maybeSingle(),
    supabase.from("tips").select("slug, field_key, title, body, caution").eq("stage", 1).order("sort_order"),
    getBudgetForPlan(planId),
  ]);
  const t = tips ?? [];

  async function save(form: FormData): Promise<string[]> {
    "use server";
    const r = await saveFinancialProfile(planId, form);
    if (!r.ok) return Object.keys(r.fieldErrors);
    revalidatePath(`/plans/${planId}/stage/1`); // 액션 응답에 새 예산 화면이 함께 실려 와 StageForm이 바로 팝업을 띄운다
    return [];
  }

  const field = "w-full rounded-xl border border-chb-line bg-white px-4 py-3 outline-none transition focus:border-chb-accent focus:ring-4 focus:ring-chb-accent-soft";
  const label = "mb-2 block font-semibold text-chb-ink";
  const money = (name: string, text: string, v: number | null | undefined) => (
    <div>
      <label htmlFor={name} className={label}>{text}</label>
      <MoneyInput id={name} name={name} defaultMan={MAN(v)} />
      <TipPanel tips={t} fieldKey={name} />
    </div>
  );
  const checkbox = (name: string, text: string, v: boolean | null | undefined) => (
    <div>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-chb-line bg-white px-4 py-3 has-checked:border-chb-accent has-checked:bg-chb-soft2">
        <input name={name} type="checkbox" defaultChecked={!!v} className="size-5 accent-chb-accent" /> {text}
      </label>
      <TipPanel tips={t} fieldKey={name} />
    </div>
  );
  const group = (n: string, heading: string, children: React.ReactNode) => (
    <section className="rounded-3xl border border-chb-line bg-white p-6">
      <h2 className="mb-5 flex items-center gap-2 text-lg font-bold"><span className="text-chb-accent">{n}</span>{heading}</h2>
      <div className="space-y-5">{children}</div>
    </section>
  );

  return (
    <div className="flex-1 bg-chb-soft2">
      <header className="border-b border-chb-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2 font-display text-xl font-black tracking-tight"><span aria-hidden="true" className="size-2.5 rounded-full bg-chb-accent" />채비</Link>
          <p className="text-sm text-chb-muted"><span className="font-semibold text-chb-accent">1</span> / 5단계</p>
        </div>
        <div className="h-1 bg-chb-line" aria-hidden="true"><div className="h-full w-1/5 bg-chb-accent" /></div>
      </header>
      <main className="mx-auto grid w-full max-w-6xl items-start gap-8 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_420px]">
        <StageForm
          title="1단계. 나의 구매 상황" labels={LABELS} action={save}
          result={<BudgetCard result={budget} flat />}
          resultKey={p?.updated_at}
          next={{ href: `/plans/${planId}/stage/2`, label: "2단계로 →" }}
        >
          <p className="-mt-4 text-chb-muted">재정 상황을 입력하면 구매 가능 예산과 대출, 부대비용을 계산해 드려요.</p>
          {group("①", "주택 구매 목적", <>
            <div>
              <label htmlFor="purpose" className={label}>구매 목적</label>
              <select id="purpose" name="purpose" defaultValue={p?.purpose ?? ""} className={field}>
                <option value="">선택</option><option value="live">실거주</option><option value="invest">투자</option><option value="both">실거주 및 투자</option>
              </select>
              <TipPanel tips={t} fieldKey="purpose" />
            </div>
            <div>
              <label htmlFor="timeline" className={label}>구매 희망 시기</label>
              <select id="timeline" name="timeline" defaultValue={p?.timeline ?? ""} className={field}>
                <option value="">선택</option><option value="6m">6개월 이내</option><option value="1y">1년 이내</option><option value="2_3y">2~3년 이내</option><option value="undecided">미정</option>
              </select>
              <TipPanel tips={t} fieldKey="timeline" />
            </div>
          </>)}
          {group("②", "자금 상황", <>
            {money("cash_assets", "보유 현금·자기자본", p?.cash_assets)}
            {money("annual_income", "연 소득", p?.annual_income)}
            {checkbox("income_is_combined", "부부 합산 소득입니다", p?.income_is_combined)}
            {money("existing_debt", "기존 대출·부채 총액", p?.existing_debt)}
            {money("existing_debt_annual_payment", "기존 대출 연간 원리금 상환액", p?.existing_debt_annual_payment)}
            {money("extra_funds", "추가 가용 자금", p?.extra_funds)}
            <div>
              <label htmlFor="owned_house_count" className={label}>보유 주택 수</label>
              <input id="owned_house_count" name="owned_house_count" type="number" min={0} step={1} defaultValue={p?.owned_house_count ?? 0} className={field} />
              <TipPanel tips={t} fieldKey="owned_house_count" />
            </div>
          </>)}
          {group("③", "금융 관련 정보", <>
            {checkbox("is_first_time", "생애 최초 주택 구입입니다", p?.is_first_time)}
            {checkbox("is_newlywed", "신혼부부입니다", p?.is_newlywed)}
            {checkbox("has_newborn", "2년 내 출산(예정) 가구입니다", p?.has_newborn)}
          </>)}
          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" className="rounded-full bg-chb-accent px-7 py-4 font-bold text-white shadow-[0_16px_32px_-14px_rgba(46,125,91,0.55)] transition hover:-translate-y-0.5 disabled:opacity-60">저장하고 예산 계산</button>
            <Link href={`/plans/${planId}/stage/2`} className="font-semibold text-chb-accent hover:underline">다음: 2단계 희망 주거 환경 →</Link>
          </div>
        </StageForm>
        <div className="space-y-6 lg:sticky lg:top-6">
          <BudgetCard result={budget} />
          <ChatPanel planId={planId} />
        </div>
      </main>
    </div>
  );
}
