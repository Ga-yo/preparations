// 섹션 본문으로 쓰는 TIP(5단계 확인·절차, 리포트). 접지 않고 펼쳐 둔다
export function TipCards({ tips, empty = "안내를 불러오지 못했습니다." }: {
  tips: { title: string; body: string; caution: string | null; slug?: string }[]; empty?: string;
}) {
  if (!tips.length) return <p className="text-sm text-chb-muted">{empty}</p>;
  return (
    <div className="space-y-3">
      {tips.map((t) => (
        <div key={t.slug ?? t.title} className="rounded-2xl bg-chb-soft2 p-5 text-sm leading-relaxed text-chb-ink print:break-inside-avoid">
          <p className="mb-2 font-bold">{t.title}</p>
          <p className="whitespace-pre-line">{t.body}</p>
          {t.caution && <p className="mt-3 font-medium text-chb-accent">알아두기: {t.caution}</p>}
        </div>
      ))}
    </div>
  );
}
