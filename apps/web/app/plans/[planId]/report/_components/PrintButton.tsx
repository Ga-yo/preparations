"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-full border-2 border-chb-line bg-white px-5 py-2 text-sm font-bold text-chb-ink transition hover:border-chb-accent hover:text-chb-accent print:hidden">
      인쇄 · PDF로 저장
    </button>
  );
}
