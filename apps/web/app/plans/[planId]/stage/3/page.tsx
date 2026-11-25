import Link from "next/link";
import { stageTipPicks } from "../../_components/assistant";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { AssistantPanel } from "../../_components/AssistantPanel";
import { ChoiceCards, CheckCard, labelClass, PrioritySwitch, Section, ToggleChips, UnitInput } from "../../_components/Field";
import { MoneyInput } from "../../_components/MoneyInput";
import { CONDITION_LABELS, ConditionCheckCard } from "../../_components/ConditionCheckCard";
import { StageForm } from "../../_components/StageForm";
import { StageTabs } from "../../_components/StageTabs";
import { TipPanel, TipPicks } from "../../_components/TipPanel";
import { checkConditionsForPlan, parsePrefill, PRIORITY_KEYS, saveStage3Conditions } from "./actions";
import { Stage3Summary } from "./_components/Stage3Summary";

const LABELS: Record<string, string> = {
  housing_types: "주택 유형", price_min: "희망 최저가", price_max: "희망 최고가(최저 ≤ 최고)",
  rooms_min: "방 개수(1~10)", baths_min: "욕실 개수(1~5)",
  floor_pref: "희망 층", direction_pref: "희망 향", approval_year_min: "준공 연도(1950~2030)",
  household_count_min: "세대수(1~10,000)", parking_per_household_min: "세대당 주차(0~5대)",
  station_distance_max_m: "지하철역까지 직선거리(100~5,000m, 50m 단위)", elementary_distance_max_m: "초등학교까지 직선거리(100~5,000m, 50m 단위)", floor_area_ratio_max: "용적률 상한(0~2,000%)",
  ...Object.fromEntries(PRIORITY_KEYS.map((k) => [`priority.${k}`, `${CONDITION_LABELS[k]} 우선순위`])),
  plan: "계획(접근 권한 없음 또는 존재하지 않음)",
};
const TYPES = { apartment: "아파트", officetel: "오피스텔", row_house: "연립·다세대" } as const;
const FLOORS = { low: "저층", mid: "중층", high: "고층" } as const;
const DIRECTIONS = { east: "동향", west: "서향", south: "남향", north: "북향" } as const;
// 요청마다 쿠키·DB로 렌더하는 페이지: cacheComponents 프리렌더 대신 요청 시 렌더
export const instant = false;

export default async function Stage3({
  params, searchParams,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ prefill?: string }>;
}) {
  await connection();
  const { planId } = await params;
  const prefill = parsePrefill((await searchParams).prefill);
  if (!z.uuid().safeParse(planId).success) notFound();
  const supabase = await createClient();
  const [{ data: c }, { data: tips }, check] = await Promise.all([
    supabase.from("condition_sets").select("*").eq("plan_id", planId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("tips").select("slug, field_key, title, body, caution").eq("stage", 3).order("sort_order"),
    checkConditionsForPlan(planId),
  ]);
  const t = tips ?? [];
  const priorities = { ...(c?.priorities ?? {}) as Record<string, string>, ...(prefill && { [prefill.key]: prefill.value }) };

  async function save(form: FormData): Promise<string[]> {
    "use server";
    const r = await saveStage3Conditions(planId, form);
    if (!r.ok) return Object.keys(r.fieldErrors);
    revalidatePath(`/plans/${planId}/stage/3`); // 새 condition_set으로 다시 그린다. 도착은 StageForm이 resultKey(c.id)로 확인한다
    return [];
  }

  const FORM_ID = "stage3-form";
  const tip = (key: string) => <TipPanel tips={t} fieldKey={key} />;
  const prio = (key: string) => <PrioritySwitch name={`priority.${key}`} label={`${CONDITION_LABELS[key]} 우선순위`} value={priorities[key]} />;
  const unitField = (name: string, label: string, unit: string, v: number | null | undefined, min: number, max: number, step = 1, priorityKey?: string) => (
    <div>
      <label htmlFor={name} className={labelClass}>{label}</label>
      <UnitInput id={name} unit={unit} defaultValue={v} min={min} max={max} step={step} />
      {priorityKey && prio(priorityKey)}
      {tip(name)}
    </div>
  );
  const man = (v: number | null | undefined) => (v == null ? null : v / 10_000);
  const areaText = c?.area_min == null && c?.area_max == null ? null : `전용 ${c?.area_min ?? ""}~${c?.area_max ?? ""}㎡`;

  const cd = check.data as { conflicts?: unknown[]; counts?: { must: number } };
  const resultLabel = cd.counts ? `충돌 ${cd.conflicts?.length ? `${cd.conflicts.length}건` : "없음"} · 필수 충족 ${cd.counts.must.toLocaleString("ko-KR")}곳` : undefined;

  const tipPicks = stageTipPicks(planId, 3).catch((e): null => (console.error("tip picks failed", e), null)); // 기다리지 않는다: TIP만 나중에 나타난다
  return (
    <TipPicks value={tipPicks}>
    <div className="flex-1 bg-chb-soft2 pb-28">
      <StageTabs planId={planId} current={3} />
      <main className="mx-auto grid w-full max-w-6xl items-start gap-8 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <StageForm
          id={FORM_ID} title="3단계. 주택 선택 기준" labels={LABELS} action={save}
          result={<ConditionCheckCard result={check} tips={t} flat />} resultKey={c?.id} resultLabel={resultLabel}
          resultTitle="조건 점검 결과" resultCaption="조건 점검 보기"
          next={{ href: `/plans/${planId}/stage/4`, label: "4단계로 →" }}
          pendingText="저장하고 조건을 점검하는 중이에요…"
        >
          <p className="-mt-4 text-lg text-chb-muted">조건마다 필수·선호·상관없음을 고르세요. 필수 조건끼리 부딪히면 점검 결과에서 알려 드려요.</p>
          {prefill && (
            <p role="status" className="rounded-2xl bg-amber-50 p-4 text-amber-900">
              AI 점검 제안으로 「{CONDITION_LABELS[prefill.key]}」 우선순위를 「{({ must: "필수", prefer: "선호", ignore: "상관없음" } as const)[prefill.value]}」으로 미리 골라 두었어요. 저장해야 반영됩니다.
            </p>
          )}
          {/* 저장되면 새 condition_set(또는 다른 AI 제안)으로 입력칸만 다시 마운트한다(폼 상태·팝업은 유지) */}
          <div key={`${c?.id ?? "new"}-${prefill?.key ?? ""}`} className="space-y-8">
            <Section n={1} heading="주택 기본 조건" desc="어떤 집을 찾는지 기본부터 정해요. 금액은 만 원 단위예요.">
              <ToggleChips name="housing_types" legend="주택 유형" values={c?.housing_types ?? []} options={TYPES} tip={tip("housing_types")} />
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <label htmlFor="price_min" className={labelClass}>희망 최저가</label>
                  <MoneyInput id="price_min" name="price_min" defaultMan={man(c?.price_min)} />
                  {/* 최저가는 예산 충돌 판정에만 쓴다(M3 설계, 2026-11-19 결정). 싼 단지를 빼면 손해일 수 있어 거르지 않는다 */}
                  <p className="text-sm text-chb-muted">예산과 맞는지만 확인하고 후보를 거르지는 않아요.</p>
                </div>
                <div>
                  <label htmlFor="price_max" className={labelClass}>희망 최고가</label>
                  <MoneyInput id="price_max" name="price_max" defaultMan={man(c?.price_max)} />
                  {prio("price_max")}
                  {tip("price_max")}
                </div>
              </div>
              {/* 면적은 2단계에서만 입력한다(M6-D4) */}
              <div>
                <p className={labelClass}>희망 전용면적</p>
                <div className="flex items-center justify-between rounded-xl bg-chb-soft2 px-4 py-3">
                  <span>{areaText ?? "2단계에서 아직 입력하지 않았어요"}</span>
                  <Link href={`/plans/${planId}/stage/2`} className="text-sm font-semibold text-chb-accent hover:underline">2단계에서 수정</Link>
                </div>
                {areaText && prio("area")}
              </div>
              <div className="grid gap-6 sm:grid-cols-2">
                {unitField("rooms_min", "방 개수 (최소)", "개", c?.rooms_min, 1, 10)}
                {unitField("baths_min", "욕실 개수 (최소)", "개", c?.baths_min, 1, 5)}
              </div>
              <ChoiceCards name="floor_pref" legend="희망 층" value={c?.floor_pref ?? ""} cols="grid-cols-2 sm:grid-cols-4" tip={tip("floor_pref")}
                options={[["", "상관없음"], ...Object.entries(FLOORS) as [string, string][]]} />
              <ChoiceCards name="direction_pref" legend="희망 향" value={c?.direction_pref ?? ""} cols="grid-cols-3 sm:grid-cols-5" tip={tip("direction_pref")}
                options={[["", "상관없음"], ...Object.entries(DIRECTIONS) as [string, string][]]} />
              {/* 향은 세대마다 달라 단지 데이터에 없다. 후보를 거르지 않고 점검 결과에 안내만 한다(unit_level_condition) */}
              <p className="-mt-4 text-sm text-chb-muted">향은 세대마다 달라 후보 단지를 거르지 않아요. 매물을 볼 때 확인하세요.</p>
            </Section>
            <Section n={2} heading="단지 조건" desc="단지의 나이와 규모, 주차 여건을 정해요.">
              <div className="grid gap-6 sm:grid-cols-2">
                {unitField("approval_year_min", "준공 연도", "년 이후", c?.approval_year_min, 1950, 2030, 1, "approval_year_min")}
                {unitField("household_count_min", "세대수", "세대 이상", c?.household_count_min, 1, 10000, 1, "household_count_min")}
                {unitField("parking_per_household_min", "세대당 주차 대수", "대 이상", c?.parking_per_household_min, 0, 5, 0.1, "parking_per_household_min")}
              </div>
            </Section>
            <Section n={3} heading="주택 가치 조건" desc="재건축·재개발 가능성을 볼 때 참고하는 지표예요.">
              {unitField("floor_area_ratio_max", "용적률 상한", "% 이하", c?.floor_area_ratio_max, 0, 2000, 0.01, "floor_area_ratio_max")}
              <CheckCard name="redevelopment_interest" text="재건축·재개발 가능성에 관심이 있습니다" defaultChecked={!!c?.redevelopment_interest} tip={tip("redevelopment_interest")} />
            </Section>
            <Section n={4} heading="교통·교육 조건" desc="단지에서 직선거리로 따져요. 실제 걷는 거리는 더 길어요.">
              <div className="grid gap-6 sm:grid-cols-2">
                {unitField("station_distance_max_m", "지하철역까지", "m 이내", c?.station_distance_max_m, 100, 5000, 50, "station_distance_max")}
                {unitField("elementary_distance_max_m", "초등학교까지", "m 이내", c?.elementary_distance_max_m, 100, 5000, 50, "elementary_distance_max")}
              </div>
            </Section>
          </div>
        </StageForm>
        <div className="space-y-6 lg:sticky lg:top-24">
          <Stage3Summary key={`${c?.id ?? "new"}-${prefill?.key ?? ""}`} formId={FORM_ID} areaText={areaText} />
          <AssistantPanel planId={planId} stage={3} />
        </div>
      </main>
    </div>
    </TipPicks>
  );
}
