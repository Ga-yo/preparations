import Link from "next/link";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { RankedComplex } from "@/lib/calc/fit";
import type { ToolResult } from "@/lib/agent/tool";
import { AssistantPanel } from "../../_components/AssistantPanel";
import { StageTabs } from "../../_components/StageTabs";
import { DATASETS, ERRORS, NOTICES } from "../../_components/ConditionCheckCard";
import { detailForPlan, favoriteComplexIds, searchForPlan, setFavorite } from "./actions";
import { enterStage5 } from "../5/actions";
import { CandidateList } from "./_components/CandidateList";
import { ComplexDetail } from "./_components/ComplexDetail";

// 요청마다 쿠키·DB로 렌더하는 페이지: cacheComponents 프리렌더 대신 요청 시 렌더
export const instant = false;

const FAV_ERRORS: Record<string, string> = {
  conditions_required: "관심 단지로 저장하려면 2단계 지역과 3단계 주택 조건을 먼저 저장하세요.",
  not_found: "이 단지를 관심 단지로 저장할 수 없습니다.",
  invalid: "요청이 올바르지 않습니다.",
  failed: "관심 단지를 저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
};

const logError = (e: unknown) => console.error("stage4", e instanceof Error ? `${e.name}: ${e.message}` : e);

type SearchData = { candidates: RankedComplex[]; total: number; blocking?: string[] } | { error: string };

export default async function Stage4({
  params, searchParams,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ complex?: string | string[]; fav_error?: string | string[] }>;
}) {
  await connection();
  const { planId } = await params;
  if (!z.uuid().safeParse(planId).success) notFound();
  const { complex, fav_error } = await searchParams;
  const favError = typeof fav_error === "string" && Object.hasOwn(FAV_ERRORS, fav_error) ? FAV_ERRORS[fav_error] : undefined;
  const parsed = z.coerce.number().int().positive().safeParse(complex);
  const selected = parsed.success ? parsed.data : null;

  const supabase = await createClient();
  const { data: tips } = await supabase.from("tips").select("slug, field_key, title, body, caution").eq("stage", 4).order("sort_order");
  const [search, favorites, detail] = await Promise.all([
    searchForPlan(planId).catch((e): null => (logError(e), null)),
    favoriteComplexIds(planId).catch((e): { complex_id: number; name: string }[] => (logError(e), [])),
    selected ? detailForPlan(planId, selected).catch((e): null => (logError(e), null)) : Promise.resolve<ToolResult | null | undefined>(undefined),
  ]);

  async function toggle(form: FormData): Promise<void> {
    "use server";
    const id = z.coerce.number().int().positive().safeParse(form.get("complex_id"));
    let error: string | null = null;
    if (!id.success) error = "invalid";
    else {
      // 던진 예외는 사용자에게 일반 코드로만 알린다
      const r = await setFavorite(planId, id.data, form.get("favorite") === "1").catch(() => ({ ok: false as const, error: "failed" }));
      if (!r.ok) error = r.error;
    }
    const qs = new URLSearchParams();
    if (selected) qs.set("complex", String(selected));
    if (error) qs.set("fav_error", error);
    // 단지를 고른 뒤엔 주소에 #complex-detail이 붙어 있어, 같은 주소로 redirect하면 해시 이동으로 보고 다시 그리지 않는다
    revalidatePath(`/plans/${planId}/stage/4`);
    redirect(`/plans/${planId}/stage/4${qs.size ? `?${qs}` : ""}`);
  }

  async function toStage5(): Promise<void> {
    "use server";
    await enterStage5(planId).catch(logError); // 단계 기록 실패해도 비교 화면은 연다
    redirect(`/plans/${planId}/stage/5`);
  }

  const data = search?.data as SearchData | undefined;
  const asOf = Object.entries(search?.as_of ?? {});
  const stage = (n: number) => <Link href={`/plans/${planId}/stage/${n}`} className="font-semibold text-chb-accent hover:underline">{n}단계</Link>;
  const box = "rounded-3xl border border-chb-line bg-white p-6 text-chb-muted";
  return (
    <div className="flex-1 bg-chb-soft2 pb-28">
      <StageTabs planId={planId} current={4} />
      <main className="mx-auto grid w-full max-w-6xl items-start gap-8 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_440px]">
        <section className="space-y-4" aria-label="후보 단지">
          <h1 className="font-display text-3xl font-black tracking-tight text-chb-ink">4단계. 후보 단지</h1>
          {data && !("error" in data) && data.candidates.length > 0 && (
            <p className="-mt-2 text-lg text-chb-muted">
              필수 조건을 통과한 <b className="text-chb-ink">{data.total.toLocaleString("ko-KR")}곳</b> 중 적합도 순 상위 {data.candidates.length}곳이에요. 마음에 드는 단지는 ☆를 눌러 관심 단지로 모아 두세요.
            </p>
          )}
          {favError && <p role="alert" className="rounded-2xl bg-red-50 p-4 text-red-900">{favError}</p>}
          {!data ? (
            <p role="alert" className={box}>후보를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.</p>
          ) : "error" in data ? (
            <p className={box}>{ERRORS[data.error] ?? "후보를 불러오지 못했습니다."} {stage(2)} · {stage(3)}에서 입력하세요.</p>
          ) : data.candidates.length === 0 ? (
            <p className={box}>
              {data.blocking === undefined
                ? <>조건에 맞는 단지 데이터가 없습니다. {stage(2)} 지역이나 {stage(3)} 조건을 바꿔 보세요.</>
                : data.blocking.length
                  ? <>필수 조건을 모두 만족하는 단지가 없습니다. 필수 조건 중 하나를 &lsquo;선호&rsquo;로 바꾸면 후보가 생길 수 있습니다. {stage(3)}에서 조정하세요.</>
                  : <>필수 조건을 모두 만족하는 단지가 없습니다. 조건 하나만 바꿔서는 후보가 생기지 않아 여러 조건을 함께 조정해야 합니다. {stage(3)}에서 조정하세요.</>}
            </p>
          ) : (
            <>
              {search?.stale?.length ? <p role="alert" className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">오래된 데이터가 포함되어 있습니다: {search.stale.map((k) => DATASETS[k] ?? k).join(", ")}</p> : null}
              <CandidateList planId={planId} candidates={data.candidates} favorites={favorites} selected={selected} toggle={toggle} />
              {!!search?.notices?.filter((n) => NOTICES[n]).length && (
                <ul className="list-disc space-y-1 pl-5 text-xs text-chb-muted">
                  {search.notices.filter((n) => NOTICES[n]).map((n) => <li key={n}>{NOTICES[n]}</li>)}
                </ul>
              )}
              {asOf.length > 0 && <p className="text-xs text-chb-muted">데이터 기준일: {asOf.map(([k, v]) => `${DATASETS[k] ?? k} ${v}`).join(" · ")}</p>}
            </>
          )}
          {/* 후보가 없거나 불러오지 못해도 저장한 관심 단지는 열고 해제할 수 있어야 한다 */}
          {!(data && !("error" in data) && data.candidates.length) && favorites.length > 0 && (
            <CandidateList planId={planId} candidates={[]} favorites={favorites} selected={selected} toggle={toggle} />
          )}
        </section>
        <div className="space-y-6">
          {/* 목록을 내리며 여러 단지를 번갈아 볼 수 있게 상세는 따라오고, 길면 패널 안에서 스크롤한다 */}
          <div className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:rounded-3xl">
            {detail === null && <p role="alert" className={box}>단지 상세를 불러오지 못했습니다.</p>}
            {detail && <ComplexDetail result={detail} tips={tips ?? []} />}
            {detail === undefined && (
              <p className={`${box} text-center`}>왼쪽에서 단지를 누르면<br />실거래·주변 시설·정비사업 같은 상세가 여기 보여요.</p>
            )}
          </div>
          <AssistantPanel planId={planId} stage={4} />
        </div>
      </main>
      {favorites.length > 0 && (
        <form action={toStage5} className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2">
          <button type="submit" disabled={favorites.length < 2}
            className="flex items-center gap-5 whitespace-nowrap rounded-full bg-chb-ink py-2.5 pr-2.5 pl-7 text-left text-white shadow-[0_18px_40px_-12px_rgba(20,32,26,0.55)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:hover:translate-y-0">
            <span>
              <span className="block text-xs text-white/70">관심 단지 {favorites.length}개</span>
              <span className="block text-lg font-bold">{favorites.length < 2 ? "1개 더 고르면 비교할 수 있어요" : "5단계에서 비교하기"}</span>
            </span>
            <span aria-hidden="true" className="grid size-11 place-items-center rounded-full bg-white/15 text-lg">→</span>
          </button>
        </form>
      )}
    </div>
  );
}
