import { connection } from "next/server";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { BudgetCard } from "../../_components/BudgetCard";
import { ChatPanel } from "../../_components/ChatPanel";
import { formatEokShort } from "../../_components/format";
import { InputSummary, type Snapshot } from "../../_components/InputSummary";
import { MoneyInput } from "../../_components/MoneyInput";
import { StageForm } from "../../_components/StageForm";
import { StageTabs } from "../../_components/StageTabs";
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
    revalidatePath(`/plans/${planId}/stage/1`); // 새 예산으로 다시 그린다. 도착 시점은 StageForm이 resultKey(updated_at)로 확인한다
    return [];
  }

  const FORM_ID = "stage1-form";
  const initial: Snapshot = {
    purpose: p?.purpose ?? "", timeline: p?.timeline ?? "",
    cash: MAN(p?.cash_assets), income: MAN(p?.annual_income), debt: MAN(p?.existing_debt),
    debtPayment: MAN(p?.existing_debt_annual_payment), extra: MAN(p?.extra_funds), houses: p?.owned_house_count ?? 0,
    firstTime: !!p?.is_first_time, newlywed: !!p?.is_newlywed, newborn: !!p?.has_newborn,
  };
  const b = budget.data as { maxRatePrice?: number; minRatePrice?: number };
  const resultLabel = b.maxRatePrice != null && b.minRatePrice != null ? `${formatEokShort(b.maxRatePrice)} ~ ${formatEokShort(b.minRatePrice)}` : undefined;

  const field = "w-full rounded-xl border border-chb-line bg-white px-4 py-3 outline-none transition focus:border-chb-accent focus:ring-4 focus:ring-chb-accent-soft";
  const label = "mb-2 flex items-center gap-2 font-semibold text-chb-ink";
  const money = (name: string, text: string, v: number | null | undefined, tag?: string) => (
    <div>
      <label htmlFor={name} className={label}>
        {text}{tag && <span className="rounded-md bg-chb-soft2 px-1.5 py-0.5 text-xs font-medium text-chb-muted">{tag}</span>}
      </label>
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
  // 선택형 카드: 라디오를 카드 전체로 감싸 고르면 테두리·배경이 바뀐다
  const choices = (name: string, legend: string, value: string | null | undefined, opts: [string, string, string?][], cols: string) => (
    <fieldset>
      <legend className={label}>{legend}</legend>
      <div className={`grid gap-3 ${cols}`}>
        {opts.map(([v, text, desc]) => (
          <label key={v} className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-chb-line bg-white p-4 transition hover:border-chb-accent/50 has-checked:border-chb-accent has-checked:bg-chb-soft2 has-focus-visible:ring-4 has-focus-visible:ring-chb-accent-soft">
            <input type="radio" name={name} value={v} defaultChecked={value === v} className="mt-0.5 size-5 shrink-0 accent-chb-accent" />
            <span>
              <span className="block font-bold">{text}</span>
              {desc && <span className="mt-0.5 block text-sm text-chb-muted">{desc}</span>}
            </span>
          </label>
        ))}
      </div>
      <TipPanel tips={t} fieldKey={name} />
    </fieldset>
  );
  const group = (n: number, heading: string, desc: string, children: React.ReactNode) => (
    <section className="rounded-3xl border border-chb-line bg-white p-6 sm:p-8">
      <div className="mb-6 flex items-start gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-chb-soft font-bold text-chb-accent">{n}</span>
        <div>
          <h2 className="font-display text-2xl font-black tracking-tight">{heading}</h2>
          <p className="mt-1 text-chb-muted">{desc}</p>
        </div>
      </div>
      <div className="space-y-6">{children}</div>
    </section>
  );

  return (
    <div className="flex-1 bg-chb-soft2 pb-28">
      <StageTabs planId={planId} current={1} />
      <main className="mx-auto grid w-full max-w-6xl items-start gap-8 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <StageForm
          id={FORM_ID} title="1단계. 나의 구매 상황" labels={LABELS} action={save}
          result={<BudgetCard result={budget} flat income={p?.annual_income} />} resultKey={p?.updated_at} resultLabel={resultLabel}
          next={{ href: `/plans/${planId}/stage/2`, label: "2단계로 →" }}
        >
          <p className="-mt-4 text-lg text-chb-muted">입력한 내용으로 무리 없는 예산을 계산하고, 받을 수 있는 대출을 찾아 드려요.</p>
          {group(1, "주택 구매 목적", "목적과 시기에 따라 맞는 대출과 준비 일정이 달라져요.", <>
            {choices("purpose", "구매 목적", p?.purpose, [
              ["live", "실거주", "내가 직접 살 집이에요"],
              ["invest", "투자", "임대나 시세 차익이 목적이에요"],
              ["both", "실거주 및 투자", "살면서 시세도 기대해요"],
            ], "sm:grid-cols-3")}
            {choices("timeline", "구매 희망 시기", p?.timeline, [
              ["6m", "6개월 이내"], ["1y", "1년 이내"], ["2_3y", "2~3년 이내"], ["undecided", "미정"],
            ], "grid-cols-2 sm:grid-cols-4")}
          </>)}
          {group(2, "자금 상황", "금액은 만 원 단위로 입력해 주세요. 1억 원은 10,000이에요.", <>
            <div className="grid gap-6 sm:grid-cols-2">
              {money("cash_assets", "보유 현금·자기자본", p?.cash_assets)}
              {money("annual_income", "연 소득", p?.annual_income, "세전")}
              {money("existing_debt", "기존 대출·부채 총액", p?.existing_debt)}
              {money("existing_debt_annual_payment", "기존 대출 연간 원리금 상환액", p?.existing_debt_annual_payment)}
              {money("extra_funds", "추가 가용 자금", p?.extra_funds)}
              <div>
                <label htmlFor="owned_house_count" className={label}>보유 주택 수</label>
                <input id="owned_house_count" name="owned_house_count" type="number" min={0} step={1} defaultValue={p?.owned_house_count ?? 0} className={field} />
                <TipPanel tips={t} fieldKey="owned_house_count" />
              </div>
            </div>
            {checkbox("income_is_combined", "연 소득은 부부 합산 소득입니다", p?.income_is_combined)}
          </>)}
          {group(3, "금융 관련 정보", "해당하면 정책대출 자격과 세금 감면을 함께 따져 볼게요.", <>
            {checkbox("is_first_time", "생애 최초 주택 구입입니다", p?.is_first_time)}
            {checkbox("is_newlywed", "신혼부부입니다", p?.is_newlywed)}
            {checkbox("has_newborn", "2년 내 출산(예정) 가구입니다", p?.has_newborn)}
          </>)}
        </StageForm>
        <div className="space-y-6 lg:sticky lg:top-24">
          <InputSummary formId={FORM_ID} initial={initial} />
          <ChatPanel planId={planId} />
        </div>
      </main>
    </div>
  );
}
