import { Suspense } from "react";
import { connection } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { detailForPlan } from "./actions";
import { ComplexDetail } from "./_components/ComplexDetail";
import { DetailSkeleton } from "./_components/DetailSkeleton";

const logError = (e: unknown) => console.error("stage4", e instanceof Error ? `${e.name}: ${e.message}` : e);

async function DetailSection({ planId, complexId }: { planId: string; complexId: number }) {
  const supabase = await createClient();
  const [detail, { data: tips }] = await Promise.all([
    detailForPlan(planId, complexId).catch((e): null => (logError(e), null)),
    supabase.from("tips").select("slug, field_key, title, body, caution").eq("stage", 4).order("sort_order"),
  ]);
  if (!detail) return <p role="alert" className="rounded-3xl border border-chb-line bg-white p-6 text-chb-muted">단지 상세를 불러오지 못했습니다.</p>;
  return <ComplexDetail result={detail} tips={tips ?? []} />;
}

// 요청마다 쿠키·DB로 렌더하는 페이지: cacheComponents 프리렌더 대신 요청 시 렌더
export const instant = false;

// 단지 상세만 그린다. 후보 목록은 layout.tsx
export default async function Stage4Detail({
  params, searchParams,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ complex?: string | string[] }>;
}) {
  await connection();
  const { planId } = await params;
  const parsed = z.coerce.number().int().positive().safeParse((await searchParams).complex);
  if (!z.uuid().safeParse(planId).success || !parsed.success) {
    return <p className="rounded-3xl border border-chb-line bg-white p-6 text-center text-chb-muted">왼쪽에서 단지를 누르면<br />실거래·주변 시설·정비사업 같은 상세가 여기 보여요.</p>;
  }
  return (
    <Suspense key={parsed.data} fallback={<DetailSkeleton />}>
      <DetailSection planId={planId} complexId={parsed.data} />
    </Suspense>
  );
}
