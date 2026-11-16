export type Tip = { slug: string; field_key: string | null; title: string; body: string; caution: string | null };

// ⓘ 클릭 시 펼쳐지는 <details>. 서버 컴포넌트라 JS 없이 동작한다.
export function TipPanel({ tips, fieldKey }: { tips: Tip[]; fieldKey: string }) {
  const mine = tips.filter((t) => t.field_key === fieldKey);
  if (!mine.length) return null;
  return (
    <details className="group mt-2 text-sm">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-full bg-chb-accent-soft px-2.5 py-1 text-xs font-semibold text-chb-accent select-none [&::-webkit-details-marker]:hidden" aria-label="TIP 보기">TIP<span aria-hidden="true" className="transition group-open:rotate-180">▾</span></summary>
      {mine.map((t) => (
        <div key={t.slug} className="mt-2 rounded-2xl bg-chb-soft2 p-4 leading-relaxed text-chb-ink">
          <p className="mb-1 font-semibold">{t.title}</p>
          <p className="whitespace-pre-line">{t.body}</p>
          {t.caution && <p className="mt-2 font-medium text-chb-accent">알아두기: {t.caution}</p>}
        </div>
      ))}
    </details>
  );
}
