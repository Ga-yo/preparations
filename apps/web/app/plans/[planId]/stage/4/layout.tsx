import Link from "next/link";
import type { ReactNode } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import type { RankedComplex } from "@/lib/calc/fit";
import { AssistantPanel } from "../../_components/AssistantPanel";
import { stageTipPicks } from "../../_components/assistant";
import { TipPicks } from "../../_components/TipPanel";
import { StageTabs } from "../../_components/StageTabs";
import { DATASETS, ERRORS, NOTICES } from "../../_components/ConditionCheckCard";
import { favoriteComplexIds, searchForPlan, setFavorite } from "./actions";
import { enterStage5 } from "../5/actions";
import { CandidateList } from "./_components/CandidateList";
import { CompareBar, FavoriteError, FavoritesProvider, type Fav } from "./_components/Favorites";

const logError = (e: unknown) => console.error("stage4", e instanceof Error ? `${e.name}: ${e.message}` : e);

type SearchData = { candidates: RankedComplex[]; total: number; blocking?: string[] } | { error: string };

// 후보 목록은 layout에 둔다: 주소의 ?complex=만 바뀌면 layout은 다시 그리지 않아, 단지를 골라도 검색을 다시 하지 않는다
export default async function Stage4Layout({ children, params }: { children: ReactNode; params: Promise<{ planId: string }> }) {
  await connection();
  const { planId } = await params;
  if (!z.uuid().safeParse(planId).success) notFound();
  const [search, favorites] = await Promise.all([
    searchForPlan(planId).catch((e): null => (logError(e), null)),
    favoriteComplexIds(planId).catch((e): Fav[] => (logError(e), [])),
  ]);

  // 관심 단지 저장은 DB에만 쓴다. 화면은 Favorites가 바로 바꿔 두므로 페이지를 다시 그리지 않는다
  async function save(complexId: number, favorite: boolean): Promise<string | null> {
    "use server";
    if (!z.number().int().positive().safeParse(complexId).success || typeof favorite !== "boolean") return "invalid";
    // 던진 예외는 사용자에게 일반 코드로만 알린다
    const r = await setFavorite(planId, complexId, favorite).catch((e) => (logError(e), { ok: false as const, error: "failed" }));
    return r.ok ? null : r.error;
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
  // 기다리지 않는다: TIP만 나중에 나타난다. layout이라 단지를 바꿔도 다시 고르지 않는다
  const tipPicks = stageTipPicks(planId, 4).catch((e): null => (logError(e), null));
  return (
    <TipPicks value={tipPicks}>
    <FavoritesProvider initial={favorites} save={save}>
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
            <FavoriteError />
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
                <CandidateList planId={planId} candidates={data.candidates} />
                {!!search?.notices?.filter((n) => NOTICES[n]).length && (
                  <ul className="list-disc space-y-1 pl-5 text-xs text-chb-muted">
                    {search.notices.filter((n) => NOTICES[n]).map((n) => <li key={n}>{NOTICES[n]}</li>)}
                  </ul>
                )}
                {asOf.length > 0 && <p className="text-xs text-chb-muted">데이터 기준일: {asOf.map(([k, v]) => `${DATASETS[k] ?? k} ${v}`).join(" · ")}</p>}
              </>
            )}
            {/* 후보가 없거나 불러오지 못해도 저장한 관심 단지는 열고 해제할 수 있어야 한다 */}
            {!(data && !("error" in data) && data.candidates.length) && <CandidateList planId={planId} candidates={[]} />}
            <AssistantPanel planId={planId} stage={4} />
          </section>
          {/* 목록을 내리며 여러 단지를 번갈아 볼 수 있게 상세는 따라오고, 길면 탭 내용만 패널 안에서 스크롤한다 */}
          <div className="min-w-0 lg:sticky lg:top-24 lg:flex lg:max-h-[calc(100vh-7rem)] lg:flex-col">{children}</div>
        </main>
        <CompareBar toStage5={toStage5} />
      </div>
    </FavoritesProvider>
    </TipPicks>
  );
}
