import { connection } from "next/server";
import { stageTipPicks } from "../../_components/assistant";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { BudgetCard } from "../../_components/BudgetCard";
import { AssistantPanel } from "../../_components/AssistantPanel";
import { CheckCard, ChoiceCards, inputClass, labelClass, Section } from "../../_components/Field";
import { formatEokShort } from "../../_components/format";
import { InputSummary, type Snapshot } from "../../_components/InputSummary";
import { MoneyInput } from "../../_components/MoneyInput";
import { StageForm } from "../../_components/StageForm";
import { StageTabs } from "../../_components/StageTabs";
import { TipPanel, TipPicks } from "../../_components/TipPanel";
import { getBudgetForPlan, saveFinancialProfile } from "./actions";

const LABELS: Record<string, string> = {
  purpose: "구매 목적", timeline: "구매 희망 시기", cash_assets: "보유 현금·자기자본", annual_income: "연 소득",
  has_debt: "기존 대출·부채 보유 여부", existing_debt: "기존 대출·부채 총액",
  existing_debt_annual_payment: "기존 대출 연간 원리금 상환액(부채가 있으면 필수)",
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
  // 보유 여부는 저장하지 않으므로 저장된 금액에서 되살린다(처음이면 미선택)
  const hasDebt = (p?.existing_debt ?? 0) > 0 || (p?.existing_debt_annual_payment ?? 0) > 0;
  const b = budget.data as { maxRatePrice?: number; minRatePrice?: number };
  const resultLabel = b.maxRatePrice != null && b.minRatePrice != null ? `${formatEokShort(b.maxRatePrice)} ~ ${formatEokShort(b.minRatePrice)}` : undefined;

  const tip = (key: string) => <TipPanel tips={t} fieldKey={key} />;
  const money = (name: string, text: string, v: number | null | undefined, tag?: string) => (
    <div>
      <label htmlFor={name} className={labelClass}>
        {text}{tag && <span className="rounded-md bg-chb-soft2 px-1.5 py-0.5 text-xs font-medium text-chb-muted">{tag}</span>}
      </label>
      <MoneyInput id={name} name={name} defaultMan={MAN(v)} />
      {tip(name)}
    </div>
  );
  const checkbox = (name: string, text: string, v: boolean | null | undefined) => (
    <CheckCard name={name} text={text} defaultChecked={!!v} tip={tip(name)} />
  );

  const tipPicks = stageTipPicks(planId, 1).catch((e): null => (console.error("tip picks failed", e), null)); // 기다리지 않는다: TIP만 나중에 나타난다
  return (
    <TipPicks value={tipPicks}>
    <div className="flex-1 bg-chb-soft2 pb-28">
      <StageTabs planId={planId} current={1} />
      <main className="mx-auto grid w-full max-w-6xl items-start gap-8 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <StageForm
          id={FORM_ID} title="1단계. 나의 구매 상황" labels={LABELS} action={save}
          wide result={<BudgetCard result={budget} flat income={p?.annual_income} />} resultKey={p?.updated_at} resultLabel={resultLabel}
          next={{ href: `/plans/${planId}/stage/2`, label: "2단계로 →" }}
          pendingText="저장하고 예산을 계산하는 중이에요…"
          resultTitle="예산 계산 결과" resultCaption="내 예산 보기"
        >
          <p className="-mt-4 text-lg text-chb-muted">입력한 내용으로 무리 없는 예산을 계산하고, 받을 수 있는 대출을 찾아 드려요.</p>
          <Section n={1} heading="주택 구매 목적" desc="목적과 시기에 따라 맞는 대출과 준비 일정이 달라져요.">
            <ChoiceCards name="purpose" legend="구매 목적" value={p?.purpose} cols="sm:grid-cols-3" tip={tip("purpose")} options={[
              ["live", "실거주", "내가 직접 살 집이에요"],
              ["invest", "투자", "임대나 시세 차익이 목적이에요"],
              ["both", "실거주 및 투자", "살면서 시세도 기대해요"],
            ]} />
            <ChoiceCards name="timeline" legend="구매 희망 시기" value={p?.timeline} cols="grid-cols-2 sm:grid-cols-4" tip={tip("timeline")} options={[
              ["6m", "6개월 이내"], ["1y", "1년 이내"], ["2_3y", "2~3년 이내"], ["undecided", "미정"],
            ]} />
          </Section>
          <Section n={2} heading="자금 상황" desc="금액은 만 원 단위로 입력해 주세요. 1억 원은 10,000이에요.">
            <div className="grid gap-6 sm:grid-cols-2">
              {money("cash_assets", "보유 현금·자기자본", p?.cash_assets)}
              {money("annual_income", "연 소득", p?.annual_income, "세전")}
              {money("extra_funds", "추가 가용 자금", p?.extra_funds)}
              <div>
                <label htmlFor="owned_house_count" className={labelClass}>보유 주택 수</label>
                <input id="owned_house_count" name="owned_house_count" type="number" min={0} step={1} defaultValue={p?.owned_house_count ?? 0} className={inputClass} />
                {tip("owned_house_count")}
              </div>
            </div>
            {checkbox("income_is_combined", "연 소득은 부부 합산 소득입니다", p?.income_is_combined)}
            {/* 체크할 때만 부채 입력칸을 보여 준다. 체크 안 하면 서버가 0으로 저장한다 */}
            <div className="group/debt space-y-6">
              {checkbox("has_debt", "기존 대출·부채가 있습니다", hasDebt)}
              <div className="hidden gap-6 group-has-[input[type=checkbox]:checked]/debt:grid sm:grid-cols-2">
                {money("existing_debt", "기존 대출·부채 총액", p?.existing_debt)}
                {money("existing_debt_annual_payment", "기존 대출 연간 원리금 상환액", p?.existing_debt_annual_payment)}
              </div>
            </div>
          </Section>
          <Section n={3} heading="금융 관련 정보" desc="해당하면 정책대출 자격과 세금 감면을 함께 따져 볼게요.">
            {checkbox("is_first_time", "생애 최초 주택 구입입니다", p?.is_first_time)}
            {checkbox("is_newlywed", "신혼부부입니다", p?.is_newlywed)}
            {checkbox("has_newborn", "2년 내 출산(예정) 가구입니다", p?.has_newborn)}
          </Section>
        </StageForm>
        <div className="space-y-6 lg:sticky lg:top-24">
          <InputSummary formId={FORM_ID} initial={initial} />
          <AssistantPanel planId={planId} stage={1} />
        </div>
      </main>
    </div>
    </TipPicks>
  );
}
