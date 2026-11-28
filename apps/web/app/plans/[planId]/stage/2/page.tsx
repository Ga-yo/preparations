import { connection } from "next/server";
import { stageTipPicks } from "../../_components/assistant";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { AssistantPanel } from "../../_components/AssistantPanel";
import { CheckCard, inputClass, labelClass, ScaleChoice, Section, UnitInput } from "../../_components/Field";
import { RegionPriceCard } from "../../_components/RegionPriceCard";
import { StageForm } from "../../_components/StageForm";
import { StageProgress } from "../../_components/StageProgress";
import { StageTabs } from "../../_components/StageTabs";
import { TipPanel, TipPicks } from "../../_components/TipPanel";
import { stationLabel } from "@/lib/agent/region";
import { getRegionPricesForPlan, saveStage2Conditions } from "./actions";
import { SigunguPicker } from "./_components/SigunguPicker";

const LABELS: Record<string, string> = {
  sigungu_codes: "희망 시군구", dong_names: "희망 동(지역명을 찾지 못했거나 여러 곳과 일치 — 시·구부터 입력해 주세요)",
  commute_region_name: "직장·주요 이동 지역(지역명·역 이름을 찾지 못했거나 여러 곳과 일치 — 시·구부터 쓰거나 다른 역 이름을 입력해 주세요)",
  commute_minutes_max: "희망 출퇴근 시간(10~180분)", school_importance: "교육 환경 중요도", infra_importance: "편의시설 중요도",
  household_size: "거주 인원", area_min: "희망 전용면적", area_max: "희망 전용면적(최소 ≤ 최대)",
  region_reason: "선호 이유(200자 이내)", plan: "계획(접근 권한 없음 또는 존재하지 않음)",
};
// 요청마다 쿠키·DB로 렌더하는 페이지: cacheComponents 프리렌더 대신 요청 시 렌더
export const instant = false;

export default async function Stage2({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  await connection();
  const { planId } = await params;
  if (!z.uuid().safeParse(planId).success) notFound();
  const supabase = await createClient();
  const [{ data: sigungu }, { data: c }, { data: tips }, prices] = await Promise.all([
    supabase.from("capital_sigungu").select("sigungu_code, sido, full_name").order("sigungu_code"),
    supabase.from("condition_sets").select("*").eq("plan_id", planId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("tips").select("slug, field_key, title, body, caution").eq("stage", 2).order("sort_order"),
    getRegionPricesForPlan(planId),
  ]);
  const t = tips ?? [];
  const saved = new Set(c?.region_codes ?? []);
  // 희망 동·통근 지역은 코드로 저장되어 있어 이름을 다시 조회해 채운다
  const dongCodes = [...saved].filter((x) => !x.endsWith("00000"));
  const nameCodes = [...dongCodes, ...(c?.commute_region_code ? [c.commute_region_code] : [])];
  const { data: named } = nameCodes.length
    ? await supabase.from("regions").select("code, full_name").in("code", nameCodes)
    : { data: [] };
  const nameOf = (code: string) => named?.find((r) => r.code === code)?.full_name ?? "";

  async function save(form: FormData): Promise<string[]> {
    "use server";
    const r = await saveStage2Conditions(planId, form);
    if (!r.ok) return Object.keys(r.fieldErrors);
    revalidatePath(`/plans/${planId}/stage/2`); // 새 condition_set으로 다시 그린다. 도착은 StageForm이 resultKey(c.id)로 확인한다
    return [];
  }

  const FORM_ID = "stage2-form";
  const tip = (key: string) => <TipPanel tips={t} fieldKey={key} />;
  const textField = (name: string, label: string, defaultValue: string, placeholder?: string, maxLength?: number) => (
    <div>
      <label htmlFor={name} className={labelClass}>{label}</label>
      <input id={name} name={name} defaultValue={defaultValue} placeholder={placeholder} maxLength={maxLength} className={inputClass} />
      {tip(name)}
    </div>
  );
  const unitField = (name: string, label: string, unit: string, v: number | null | undefined, min: number, max: number, step = 1) => (
    <div>
      <label htmlFor={name} className={labelClass}>{label}</label>
      <UnitInput id={name} unit={unit} defaultValue={v} min={min} max={max} step={step} />
      {tip(name)}
    </div>
  );

  const initialCodes = [...saved].filter((x) => x.endsWith("00000")).map((x) => x.slice(0, 5))
    .filter((code) => sigungu?.some((s) => s.sigungu_code === code)); // 비수도권·상위 코드는 지도에 없으니 뺀다
  const dongText = dongCodes.map(nameOf).join(", ");
  const commuteText = c?.commute_station ? stationLabel(c.commute_station) : c?.commute_region_code ? nameOf(c.commute_region_code) : "";
  const pd = prices.data as { regions?: { affordable?: boolean }[] };
  const rows = pd.regions ?? [];
  const known = rows.filter((r) => r.affordable !== undefined);
  const resultLabel = rows.length === 0 ? undefined
    : known.length ? `${rows.length}곳 중 ${known.filter((r) => r.affordable).length}곳 예산 내` : `${rows.length}곳 시세`;

  const tipPicks = stageTipPicks(planId, 2).catch((e): null => (console.error("tip picks failed", e), null)); // 기다리지 않는다: TIP만 나중에 나타난다
  return (
    <TipPicks value={tipPicks}>
    <div className="flex-1 bg-chb-soft2 pb-28">
      <StageTabs planId={planId} current={2} />
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <StageForm
          id={FORM_ID} submitLabel="저장하고 시세 보기" progress={<StageProgress formId={FORM_ID} stage={2} />} title="2단계. 희망하는 주거 환경" labels={LABELS} action={save}
          result={<RegionPriceCard result={prices} flat />} resultKey={c?.id} resultLabel={resultLabel}
          resultTitle="희망 지역 시세" resultCaption="지역 시세 보기"
          next={{ href: `/plans/${planId}/stage/3`, label: "3단계로 →" }}
          pendingText="저장하고 지역 시세를 불러오는 중이에요…"
        >
          <p className="-mt-4 text-lg text-chb-muted">살고 싶은 지역과 생활 방식을 알려 주면, 예산과 비교한 지역 시세를 보여 드려요.</p>
          {/* 저장되면 새 condition_set으로 입력칸만 다시 마운트해 정규화된 지역명을 보여 준다(폼 상태·팝업은 유지) */}
          <div key={c?.id ?? "new"} className="space-y-8">
            <Section n={1} heading="희망 지역" desc="지도에서 최대 10곳까지 고를 수 있어요. 실거래가는 수도권만 제공해요.">
              <fieldset>
                <legend className={labelClass}>희망 시군구</legend>
                <SigunguPicker rows={sigungu ?? []} initial={initialCodes} />
                {tip("sigungu_codes")}
              </fieldset>
              {textField("dong_names", "희망 동 (선택)", dongText, "쉼표로 구분, 예: 강남구 개포동")}
              {textField("region_reason", "특정 지역을 선호하는 이유 (선택)", c?.region_reason ?? "", undefined, 200)}
            </Section>
            <Section n={2} heading="생활 환경" desc="출퇴근과 생활 인프라는 지역을 고를 때 가장 많이 따지는 조건이에요.">
              <div className="grid gap-6 sm:grid-cols-2">
                {textField("commute_region_name", "직장·주요 이동 지역", commuteText, "예: 서울특별시 중구 또는 강남역")}
                {unitField("commute_minutes_max", "희망 출퇴근 시간 (편도)", "분", c?.commute_minutes_max, 10, 180)}
              </div>
              <CheckCard name="uses_transit" text="대중교통으로 출퇴근합니다" defaultChecked={!!c?.uses_transit} tip={tip("uses_transit")} />
              <ScaleChoice name="school_importance" legend="학교·교육 환경 중요도" value={c?.school_importance} tip={tip("school_importance")} />
              <ScaleChoice name="infra_importance" legend="주변 편의시설·생활 인프라 중요도" value={c?.infra_importance} tip={tip("infra_importance")} />
            </Section>
            <Section n={3} heading="거주 환경" desc="함께 살 사람과 필요한 공간을 알려 주세요.">
              <div className="grid gap-6 sm:grid-cols-3">
                {unitField("household_size", "예상 거주 인원", "명", c?.household_size, 1, 20)}
                {unitField("area_min", "희망 전용면적 최소", "㎡", c?.area_min, 10, 300, 0.01)}
                {unitField("area_max", "최대", "㎡", c?.area_max, 10, 300, 0.01)}
              </div>
              <CheckCard name="parking_required" text="주차 공간이 필요합니다" defaultChecked={!!c?.parking_required} tip={tip("parking_required")} />
            </Section>
          </div>
        </StageForm>
      </main>
      {/* 오른쪽 칸은 결과 패널, AI 상담은 화면 구석에 떠 있는 버튼 */}
      <AssistantPanel planId={planId} stage={2} />
    </div>
    </TipPicks>
  );
}
