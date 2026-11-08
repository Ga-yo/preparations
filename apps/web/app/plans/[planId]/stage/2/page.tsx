import Link from "next/link";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ChatPanel } from "../../_components/ChatPanel";
import { RegionPriceCard } from "../../_components/RegionPriceCard";
import { StageForm } from "../../_components/StageForm";
import { TipPanel } from "../../_components/TipPanel";
import { getRegionPricesForPlan, saveStage2Conditions } from "./actions";

const LABELS: Record<string, string> = {
  sigungu_codes: "희망 시군구", dong_names: "희망 동(지역명을 찾지 못했거나 여러 곳과 일치 — 시·구부터 입력해 주세요)",
  commute_region_name: "직장·주요 이동 지역(지역명을 찾지 못했거나 여러 곳과 일치 — 시·구부터 입력해 주세요)",
  commute_minutes_max: "희망 출퇴근 시간(10~180분)", school_importance: "교육 환경 중요도", infra_importance: "편의시설 중요도",
  household_size: "거주 인원", rooms_min: "필요한 방 개수", area_min: "희망 전용면적", area_max: "희망 전용면적(최소 ≤ 최대)",
  environment_prefs: "선호 환경", region_reason: "선호 이유(200자 이내)", plan: "계획(접근 권한 없음 또는 존재하지 않음)",
};
const ENV = { quiet: "조용한 환경", near_commercial: "상권 인접", near_park: "공원 인접" } as const;
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
  const bySido = Map.groupBy(sigungu ?? [], (s) => s.sido);

  async function save(form: FormData): Promise<string[]> {
    "use server";
    const r = await saveStage2Conditions(planId, form);
    if (!r.ok) return Object.keys(r.fieldErrors);
    redirect(`/plans/${planId}/stage/2`);
  }

  const field = (name: string, label: string, input: React.ReactNode) => (
    <div>
      <label htmlFor={name} className="block font-medium">{label}</label>
      {input}
      <TipPanel tips={t} fieldKey={name} />
    </div>
  );
  const numberInput = (name: string, v: number | null | undefined, min: number, max: number, step = 1) => (
    <input id={name} name={name} type="number" min={min} max={max} step={step} defaultValue={v ?? ""} className="w-full rounded border px-2 py-1" />
  );
  const importance = (name: string, v: number | null | undefined) => (
    <select id={name} name={name} defaultValue={v ?? ""} className="w-full rounded border px-2 py-1">
      <option value="">선택</option>
      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}{n === 1 ? " (낮음)" : n === 5 ? " (높음)" : ""}</option>)}
    </select>
  );
  const checkbox = (name: string, label: string, v: boolean | null | undefined) => (
    <div>
      <label className="flex items-center gap-2"><input name={name} type="checkbox" defaultChecked={!!v} /> {label}</label>
      <TipPanel tips={t} fieldKey={name} />
    </div>
  );

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-6 p-4 md:grid-cols-2">
      <StageForm
        key={c?.id ?? "new"} // 저장되면 새 condition_set으로 다시 마운트해 정규화된 지역명을 보여 준다
        title="2단계. 희망하는 주거 환경" labels={LABELS} action={save}
        back={<Link href={`/plans/${planId}/stage/1`} className="text-sm text-blue-700">← 1단계 나의 구매 상황</Link>}
      >

        <h2 className="font-semibold">① 희망 지역</h2>
        <fieldset>
          <legend className="font-medium">희망 시군구 (최대 10곳, 실거래가는 수도권만 제공)</legend>
          {[...bySido].map(([sido, rows]) => (
            <details key={sido} open={rows.some((s) => saved.has(`${s.sigungu_code}00000`))} className="mt-1">
              <summary className="cursor-pointer">{sido}</summary>
              <div className="grid grid-cols-2 gap-x-2 sm:grid-cols-3">
                {rows.map((s) => (
                  <label key={s.sigungu_code} className="flex items-center gap-1 text-sm">
                    <input type="checkbox" name="sigungu_codes" value={s.sigungu_code ?? ""} defaultChecked={saved.has(`${s.sigungu_code}00000`)} />
                    {s.full_name.slice(sido.length + 1)}
                  </label>
                ))}
              </div>
            </details>
          ))}
          <TipPanel tips={t} fieldKey="sigungu_codes" />
        </fieldset>
        {field("dong_names", "희망 동 (선택, 쉼표로 구분, 예: 강남구 개포동)",
          <input id="dong_names" name="dong_names" defaultValue={dongCodes.map(nameOf).join(", ")} className="w-full rounded border px-2 py-1" />)}
        {field("region_reason", "특정 지역을 선호하는 이유 (선택)",
          <input id="region_reason" name="region_reason" maxLength={200} defaultValue={c?.region_reason ?? ""} className="w-full rounded border px-2 py-1" />)}

        <h2 className="font-semibold">② 생활 환경</h2>
        {field("commute_region_name", "직장·주요 이동 지역 (예: 서울특별시 중구)",
          <input id="commute_region_name" name="commute_region_name" defaultValue={c?.commute_region_code ? nameOf(c.commute_region_code) : ""} className="w-full rounded border px-2 py-1" />)}
        {field("commute_minutes_max", "희망 출퇴근 시간 (분, 편도)", numberInput("commute_minutes_max", c?.commute_minutes_max, 10, 180))}
        {checkbox("uses_transit", "대중교통으로 출퇴근합니다", c?.uses_transit)}
        {field("school_importance", "학교·교육 환경 중요도", importance("school_importance", c?.school_importance))}
        {field("infra_importance", "주변 편의시설·생활 인프라 중요도", importance("infra_importance", c?.infra_importance))}

        <h2 className="font-semibold">③ 거주 환경</h2>
        {field("household_size", "예상 거주 인원", numberInput("household_size", c?.household_size, 1, 20))}
        {field("rooms_min", "필요한 방 개수", numberInput("rooms_min", c?.rooms_min, 1, 10))}
        <div className="grid grid-cols-2 gap-2">
          {field("area_min", "희망 전용면적 최소 (㎡)", numberInput("area_min", c?.area_min, 10, 300, 0.01))}
          {field("area_max", "최대 (㎡)", numberInput("area_max", c?.area_max, 10, 300, 0.01))}
        </div>
        {checkbox("parking_required", "주차 공간이 필요합니다", c?.parking_required)}
        <fieldset>
          <legend className="font-medium">선호하는 주거 환경</legend>
          {Object.entries(ENV).map(([v, label]) => (
            <label key={v} className="mr-3 inline-flex items-center gap-1">
              <input type="checkbox" name="environment_prefs" value={v} defaultChecked={c?.environment_prefs.includes(v)} /> {label}
            </label>
          ))}
        </fieldset>
        <button type="submit" className="rounded bg-foreground px-4 py-2 text-background">저장하고 지역 시세 보기</button>
      </StageForm>
      <div className="space-y-6">
        <RegionPriceCard result={prices} />
        <ChatPanel planId={planId} />
      </div>
    </main>
  );
}
