export type Tip = { slug: string; field_key: string | null; title: string; body: string; caution: string | null };

// ⓘ 클릭 시 펼쳐지는 <details>. 서버 컴포넌트라 JS 없이 동작한다.
export function TipPanel({ tips, fieldKey }: { tips: Tip[]; fieldKey: string }) {
  const mine = tips.filter((t) => t.field_key === fieldKey);
  if (!mine.length) return null;
  return (
    <details className="mt-1 text-sm">
      <summary className="cursor-pointer select-none text-blue-700" aria-label="TIP 보기">ⓘ TIP</summary>
      {mine.map((t) => (
        <div key={t.slug} className="mt-1 rounded border border-blue-200 bg-blue-50 p-2 text-gray-900">
          <p className="font-semibold">{t.title}</p>
          <p className="whitespace-pre-line">{t.body}</p>
          {t.caution && <p className="mt-1 font-medium">알아두기: {t.caution}</p>}
        </div>
      ))}
    </details>
  );
}
