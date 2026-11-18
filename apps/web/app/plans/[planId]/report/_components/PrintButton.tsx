"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded border px-3 py-1 print:hidden">
      인쇄 · PDF로 저장
    </button>
  );
}
