import Link from "next/link";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ChatPanel } from "../../_components/ChatPanel";
import { CONDITION_LABELS, ConditionCheckCard } from "../../_components/ConditionCheckCard";
import { StageForm } from "../../_components/StageForm";
import { TipPanel } from "../../_components/TipPanel";
import { checkConditionsForPlan, PRIORITY_KEYS, saveStage3Conditions } from "./actions";

const LABELS: Record<string, string> = {
  housing_types: "주택 유형", price_min: "희망 최저가", price_max: "희망 최고가(최저 ≤ 최고)",
  area_min: "희망 전용면적", area_max: "희망 전용면적(최소 ≤ 최대)", rooms_min: "방 개수(1~10)", baths_min: "욕실 개수(1~5)",
  floor_pref: "희망 층", direction_pref: "희망 향(20자 이내)", approval_year_min: "준공 연도(1950~2030)",
  household_count_min: "세대수(1~10,000)", parking_per_household_min: "세대당 주차(0~5대)",
  mgmt_fee_per_m2_max: "관리비",
  station_distance_max_m: "지하철역까지 직선거리(100~5,000m, 50m 단위)", elementary_distance_max_m: "초등학교까지 직선거리(100~5,000m, 50m 단위)", floor_area_ratio_max: "용적률 상한(0~2,000%)",
  ...Object.fromEntries(PRIORITY_KEYS.map((k) => [`priority.${k}`, `${CONDITION_LABELS[k]} 우선순위`])),
  plan: "계획(접근 권한 없음 또는 존재하지 않음)",
};
const TYPES = { apartment: "아파트", officetel: "오피스텔", row_house: "연립·다세대" } as const;
const FLOORS = { low: "저층", mid: "중층", high: "고층" } as const;
const PRIORITIES = { must: "필수", prefer: "선호", ignore: "상관없음" } as const;
// 요청마다 쿠키·DB로 렌더하는 페이지: cacheComponents 프리렌더 대신 요청 시 렌더
export const instant = false;

export default async function Stage3({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  await connection();
  const { planId } = await params;
  if (!z.uuid().safeParse(planId).success) notFound();
  const supabase = await createClient();
  const [{ data: c }, { data: tips }, check] = await Promise.all([
    supabase.from("condition_sets").select("*").eq("plan_id", planId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("tips").select("slug, field_key, title, body, caution").eq("stage", 3).order("sort_order"),
    checkConditionsForPlan(planId),
  ]);
  const t = tips ?? [];
  const priorities = (c?.priorities ?? {}) as Record<string, string>;

  async function save(form: FormData): Promise<string[]> {
    "use server";
    const r = await saveStage3Conditions(planId, form);
    if (!r.ok) return Object.keys(r.fieldErrors);
    redirect(`/plans/${planId}/stage/3`);
  }

  const numberInput = (name: string, v: number | null | undefined, min: number, max: number, step = 1) => (
    <input id={name} name={name} type="number" min={min} max={max} step={step} defaultValue={v ?? ""} className="w-full rounded border px-2 py-1" />
  );
  // 우선순위 라디오: 저장값이 없으면 '선호'(값을 입력한 조건의 기본 의미)
  const priority = (key: string) => (
    <div role="radiogroup" aria-label={`${CONDITION_LABELS[key]} 우선순위`} className="mt-1 flex gap-3 text-sm">
      {Object.entries(PRIORITIES).map(([v, label]) => (
        <label key={v} className="inline-flex items-center gap-1">
          <input type="radio" name={`priority.${key}`} value={v} defaultChecked={(priorities[key] ?? "prefer") === v} /> {label}
        </label>
      ))}
    </div>
  );
  const field = (name: string, label: string, input: React.ReactNode, priorityKey?: string) => (
    <div>
      <label htmlFor={name} className="block font-medium">{label}</label>
      {input}
      {priorityKey && priority(priorityKey)}
      <TipPanel tips={t} fieldKey={name} />
    </div>
  );
  const man = (v: number | null | undefined) => (v == null ? null : v / 10_000);

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-6 p-4 md:grid-cols-2">
      <StageForm
        key={c?.id ?? "new"}
        title="3단계. 주택 선택 기준" labels={LABELS} action={save}
        back={<Link href={`/plans/${planId}/stage/2`} className="text-sm text-blue-700">← 2단계 희망 주거 환경</Link>}
      >
        <p className="text-sm text-gray-600">조건마다 필수·선호·상관없음을 고르세요. 필수 조건끼리 충돌하면 오른쪽에서 알려 드립니다.</p>

        <h2 className="font-semibold">① 주택 기본 조건</h2>
        <fieldset>
          <legend className="font-medium">주택 유형</legend>
          {Object.entries(TYPES).map(([v, label]) => (
            <label key={v} className="mr-3 inline-flex items-center gap-1">
              <input type="checkbox" name="housing_types" value={v} defaultChecked={c?.housing_types.includes(v)} /> {label}
            </label>
          ))}
        </fieldset>
        <div className="grid grid-cols-2 gap-2">
          {field("price_min", "희망 최저가 (만원)", numberInput("price_min", man(c?.price_min), 0, 1e9))}
          {field("price_max", "희망 최고가 (만원)", numberInput("price_max", man(c?.price_max), 0, 1e9))}
        </div>
        {priority("price_max")}
        <div className="grid grid-cols-2 gap-2">
          {field("area_min", "희망 전용면적 최소 (㎡)", numberInput("area_min", c?.area_min, 10, 300, 0.01))}
          {field("area_max", "최대 (㎡)", numberInput("area_max", c?.area_max, 10, 300, 0.01))}
        </div>
        {priority("area")}
        <div className="grid grid-cols-2 gap-2">
          {field("rooms_min", "방 개수 (최소)", numberInput("rooms_min", c?.rooms_min, 1, 10))}
          {field("baths_min", "욕실 개수 (최소)", numberInput("baths_min", c?.baths_min, 1, 5))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {field("floor_pref", "희망 층",
            <select id="floor_pref" name="floor_pref" defaultValue={c?.floor_pref ?? ""} className="w-full rounded border px-2 py-1">
              <option value="">상관없음</option>
              {Object.entries(FLOORS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>)}
          {field("direction_pref", "희망 향 (예: 남향)",
            <input id="direction_pref" name="direction_pref" maxLength={20} defaultValue={c?.direction_pref ?? ""} className="w-full rounded border px-2 py-1" />)}
        </div>

        <h2 className="font-semibold">② 단지 조건</h2>
        {field("approval_year_min", "준공 연도 (이후)", numberInput("approval_year_min", c?.approval_year_min, 1950, 2030), "approval_year_min")}
        {field("household_count_min", "세대수 (이상)", numberInput("household_count_min", c?.household_count_min, 1, 10000), "household_count_min")}
        {field("parking_per_household_min", "세대당 주차 대수 (이상)", numberInput("parking_per_household_min", c?.parking_per_household_min, 0, 5, 0.1), "parking_per_household_min")}
        {field("mgmt_fee_per_m2_max", "관리비 (㎡당 월 원, 이하) — 현재 점검 데이터 없음", numberInput("mgmt_fee_per_m2_max", c?.mgmt_fee_per_m2_max, 0, 100000))}

        <h2 className="font-semibold">③ 주택 가치 조건</h2>
        {field("floor_area_ratio_max", "용적률 상한 (%)", numberInput("floor_area_ratio_max", c?.floor_area_ratio_max, 0, 2000, 0.01), "floor_area_ratio_max")}
        <div>
          <label className="flex items-center gap-2"><input name="redevelopment_interest" type="checkbox" defaultChecked={!!c?.redevelopment_interest} /> 재건축·재개발 가능성에 관심이 있습니다</label>
          <TipPanel tips={t} fieldKey="redevelopment_interest" />
        </div>
        <h2 className="font-semibold">④ 교통·교육 조건(직선거리)</h2>
        {field("station_distance_max_m", "지하철역까지 직선거리 (m, 이내)", numberInput("station_distance_max_m", c?.station_distance_max_m, 100, 5000, 50), "station_distance_max")}
        {field("elementary_distance_max_m", "초등학교까지 직선거리 (m, 이내)", numberInput("elementary_distance_max_m", c?.elementary_distance_max_m, 100, 5000, 50), "elementary_distance_max")}

        <button type="submit" className="rounded bg-foreground px-4 py-2 text-background">저장하고 조건 점검하기</button>
      </StageForm>
      <div className="space-y-6">
        <ConditionCheckCard result={check} tips={t} />
        <Link href={`/plans/${planId}/stage/4`} className="block text-sm text-blue-700">→ 4단계 후보 단지 보기</Link>
        <ChatPanel planId={planId} />
      </div>
    </main>
  );
}
