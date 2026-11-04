import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BudgetCard } from "../../_components/BudgetCard";
import { ChatPanel } from "../../_components/ChatPanel";
import { TipPanel } from "../../_components/TipPanel";
import { getBudgetForPlan, saveFinancialProfile } from "./actions";

const MAN = (v: number | null | undefined) => (v == null ? "" : String(v / 10_000));

export default async function Stage1({
  params,
  searchParams,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ invalid?: string }>;
}) {
  await connection(); // 날짜·쿠키 기반 렌더: 프리렌더 대상에서 제외
  const { planId } = await params;
  const { invalid } = await searchParams;
  const supabase = await createClient();
  const [{ data: p }, { data: tips }, budget] = await Promise.all([
    supabase.from("financial_profiles").select("*").eq("plan_id", planId).maybeSingle(),
    supabase.from("tips").select("slug, field_key, title, body, caution").eq("stage", 1).order("sort_order"),
    getBudgetForPlan(planId),
  ]);
  const t = tips ?? [];

  async function save(form: FormData) {
    "use server";
    const r = await saveFinancialProfile(planId, form);
    if (!r.ok) redirect(`/plans/${planId}/stage/1?invalid=${Object.keys(r.fieldErrors).join(",")}`);
    redirect(`/plans/${planId}/stage/1`);
  }

  const money = (name: string, label: string, v: number | null | undefined) => (
    <div>
      <label htmlFor={name} className="block font-medium">{label} (만원)</label>
      <input id={name} name={name} type="number" min={0} step={1} defaultValue={MAN(v)} className="w-full rounded border px-2 py-1" />
      <TipPanel tips={t} fieldKey={name} />
    </div>
  );
  const checkbox = (name: string, label: string, v: boolean | null | undefined) => (
    <div>
      <label className="flex items-center gap-2"><input name={name} type="checkbox" defaultChecked={!!v} /> {label}</label>
      <TipPanel tips={t} fieldKey={name} />
    </div>
  );

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-6 p-4 md:grid-cols-2">
      <form action={save} className="space-y-4">
        <h1 className="text-xl font-semibold">1단계. 나의 구매 상황</h1>
        {invalid && <p role="alert" className="rounded bg-red-100 p-2 text-red-800">입력값을 확인해 주세요: {invalid}</p>}
        <div>
          <label htmlFor="purpose" className="block font-medium">구매 목적</label>
          <select id="purpose" name="purpose" defaultValue={p?.purpose ?? ""} className="w-full rounded border px-2 py-1">
            <option value="">선택</option><option value="live">실거주</option><option value="invest">투자</option><option value="both">실거주 및 투자</option>
          </select>
          <TipPanel tips={t} fieldKey="purpose" />
        </div>
        <div>
          <label htmlFor="timeline" className="block font-medium">구매 희망 시기</label>
          <select id="timeline" name="timeline" defaultValue={p?.timeline ?? ""} className="w-full rounded border px-2 py-1">
            <option value="">선택</option><option value="6m">6개월 이내</option><option value="1y">1년 이내</option><option value="2_3y">2~3년 이내</option><option value="undecided">미정</option>
          </select>
          <TipPanel tips={t} fieldKey="timeline" />
        </div>
        {money("cash_assets", "보유 현금·자기자본", p?.cash_assets)}
        {money("annual_income", "연 소득", p?.annual_income)}
        {checkbox("income_is_combined", "부부 합산 소득입니다", p?.income_is_combined)}
        {money("existing_debt", "기존 대출·부채 총액", p?.existing_debt)}
        {money("existing_debt_annual_payment", "기존 대출 연간 원리금 상환액", p?.existing_debt_annual_payment)}
        {money("extra_funds", "추가 가용 자금", p?.extra_funds)}
        <div>
          <label htmlFor="owned_house_count" className="block font-medium">보유 주택 수</label>
          <input id="owned_house_count" name="owned_house_count" type="number" min={0} step={1} defaultValue={p?.owned_house_count ?? 0} className="w-full rounded border px-2 py-1" />
          <TipPanel tips={t} fieldKey="owned_house_count" />
        </div>
        {checkbox("is_first_time", "생애 최초 주택 구입입니다", p?.is_first_time)}
        {checkbox("is_newlywed", "신혼부부입니다", p?.is_newlywed)}
        {checkbox("has_newborn", "2년 내 출산(예정) 가구입니다", p?.has_newborn)}
        <button type="submit" className="rounded bg-foreground px-4 py-2 text-background">저장하고 예산 계산</button>
      </form>
      <div className="space-y-6">
        <BudgetCard result={budget} />
        <ChatPanel planId={planId} />
      </div>
    </main>
  );
}
