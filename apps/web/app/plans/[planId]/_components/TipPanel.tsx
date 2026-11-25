"use client";
import { createContext, Suspense, use, useContext, type ReactNode } from "react";

export type Tip = { slug: string; field_key: string | null; title: string; body: string; caution: string | null };
type Picks = { slug: string; note: string }[] | null;

// 단계 페이지가 넘기는 AI 선택 결과(Promise). 없으면(리포트 등) TIP을 모두 보여 준다
const PicksContext = createContext<Promise<Picks> | null>(null);
export function TipPicks({ value, children }: { value: Promise<Picks>; children: ReactNode }) {
  return <PicksContext value={value}>{children}</PicksContext>;
}

// AI가 고르지 않은 TIP은 숨기고, 고른 TIP에는 맞춤 한 줄을 붙인다. picks가 null이면(AI 실패·입력 없음) 모두 보여 준다
export function pickTips(tips: Tip[], picks: Picks): (Tip & { note?: string })[] {
  if (!picks) return tips;
  const note = new Map(picks.map((p) => [p.slug, p.note]));
  return tips.filter((t) => note.has(t.slug)).map((t) => ({ ...t, note: note.get(t.slug) }));
}

export function TipPanel({ tips, fieldKey }: { tips: Tip[]; fieldKey: string }) {
  const picks = useContext(PicksContext);
  const mine = tips.filter((t) => t.field_key === fieldKey);
  if (!mine.length) return null;
  if (!picks) return <TipList tips={mine} />;
  // AI가 고르는 동안은 아무것도 보이지 않다가, 고른 TIP만 나타난다
  return <Suspense fallback={null}><Picked tips={mine} picks={picks} /></Suspense>;
}

function Picked({ tips, picks }: { tips: Tip[]; picks: Promise<Picks> }) {
  return <TipList tips={pickTips(tips, use(picks))} />;
}

function TipList({ tips }: { tips: (Tip & { note?: string })[] }) {
  if (!tips.length) return null;
  return (
    <details className="group mt-2 text-sm">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-full bg-chb-accent-soft px-2.5 py-1 text-xs font-semibold text-chb-accent select-none [&::-webkit-details-marker]:hidden" aria-label="TIP 보기">TIP<span aria-hidden="true" className="transition group-open:rotate-180">▾</span></summary>
      {tips.map((t) => (
        <div key={t.slug} className="mt-2 rounded-2xl bg-chb-soft2 p-4 leading-relaxed text-chb-ink">
          {t.note && <p className="mb-2 font-semibold text-chb-accent">내 상황에선 · {t.note}</p>}
          <p className="mb-1 font-semibold">{t.title}</p>
          <p className="whitespace-pre-line">{t.body}</p>
          {t.caution && <p className="mt-2 text-chb-muted">알아두기: {t.caution}</p>}
        </div>
      ))}
    </details>
  );
}
