import Link from "next/link";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { RankedComplex } from "@/lib/calc/fit";
import type { ToolResult } from "@/lib/agent/tool";
import { ChatPanel } from "../../_components/ChatPanel";
import { ERRORS } from "../../_components/ConditionCheckCard";
import { detailForPlan, favoriteComplexIds, searchForPlan, setFavorite } from "./actions";
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
    searchForPlan(planId).catch((): null => null),
    favoriteComplexIds(planId).catch((): number[] => []),
    selected ? detailForPlan(planId, selected).catch((): null => null) : Promise.resolve<ToolResult | null | undefined>(undefined),
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
    redirect(`/plans/${planId}/stage/4${qs.size ? `?${qs}` : ""}`);
  }

  const data = search?.data as SearchData | undefined;
  const stage = (n: number) => <Link href={`/plans/${planId}/stage/${n}`} className="text-blue-700">{n}단계</Link>;
  return (
    <main className="mx-auto grid w-full max-w-5xl gap-6 p-4 md:grid-cols-2">
      <section className="space-y-3" aria-label="후보 단지">
        <Link href={`/plans/${planId}/stage/3`} className="text-sm text-blue-700">← 3단계 주택 선택 기준</Link>
        <h1 className="text-lg font-semibold">4단계. 후보 단지</h1>
        {favError && <p role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-900">{favError}</p>}
        {!data ? (
          <p role="alert" className="rounded border p-3 text-sm">후보를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.</p>
        ) : "error" in data ? (
          <p className="rounded border p-3 text-sm">{ERRORS[data.error] ?? "후보를 불러오지 못했습니다."} {stage(2)} · {stage(3)}에서 입력하세요.</p>
        ) : data.candidates.length === 0 ? (
          <p className="rounded border p-3 text-sm">
            {data.blocking === undefined
              ? <>조건에 맞는 단지 데이터가 없습니다. {stage(2)} 지역이나 {stage(3)} 조건을 바꿔 보세요.</>
              : data.blocking.length
                ? <>필수 조건을 모두 만족하는 단지가 없습니다. 필수 조건 중 하나를 &lsquo;선호&rsquo;로 바꾸면 후보가 생길 수 있습니다. {stage(3)}에서 조정하세요.</>
                : <>필수 조건을 모두 만족하는 단지가 없습니다. 조건 하나만 바꿔서는 후보가 생기지 않아 여러 조건을 함께 조정해야 합니다. {stage(3)}에서 조정하세요.</>}
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-600">필수 조건을 통과한 {data.total.toLocaleString("ko-KR")}개 중 적합도 순 상위 {data.candidates.length}개입니다.</p>
            <CandidateList planId={planId} candidates={data.candidates} favorites={favorites} selected={selected} toggle={toggle} />
          </>
        )}
      </section>
      <div className="space-y-6">
        {detail === null && <p role="alert" className="rounded border p-3 text-sm">단지 상세를 불러오지 못했습니다.</p>}
        {detail && <ComplexDetail result={detail} tips={tips ?? []} />}
        <ChatPanel planId={planId} />
      </div>
    </main>
  );
}
