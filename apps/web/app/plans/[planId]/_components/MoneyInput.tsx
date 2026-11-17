"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { caretAfterDigits, formatWon, groupDigits } from "./format";

// 만원 단위 금액 입력. 입력하는 동안 천 단위 콤마를 붙이고, 아래에 읽기 쉬운 금액(= 6천만원)을 보여 준다.
// 폼에는 콤마가 붙은 문자열이 그대로 제출되고 서버 스키마가 콤마를 뺀다.
export function MoneyInput({ id, name, defaultMan }: { id: string; name: string; defaultMan: number | null | undefined }) {
  const [value, setValue] = useState(defaultMan == null ? "" : groupDigits(String(defaultMan)));
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (caret.current !== null && ref.current === document.activeElement) {
      ref.current?.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [value]);

  const man = Number(value.replace(/,/g, ""));
  const hintId = `${id}-hint`;
  return (
    <div>
      <div className="relative">
        <input
          ref={ref} id={id} name={name} value={value} inputMode="numeric" autoComplete="off" maxLength={13}
          aria-describedby={hintId}
          onChange={(e) => {
            const el = e.currentTarget;
            const digitsBefore = el.value.slice(0, el.selectionStart ?? el.value.length).replace(/\D/g, "").length;
            const next = groupDigits(el.value);
            caret.current = caretAfterDigits(next, digitsBefore);
            setValue(next);
          }}
          className="w-full rounded-xl border border-chb-line bg-white py-3 pr-14 pl-4 text-right text-base tabular-nums outline-none transition focus:border-chb-accent focus:ring-4 focus:ring-chb-accent-soft"
        />
        <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-chb-muted">만원</span>
      </div>
      <p id={hintId} className="mt-1 min-h-5 text-right text-sm text-chb-accent" aria-live="polite">
        {value && man > 0 ? `= ${formatWon(man * 10_000)}` : ""}
      </p>
    </div>
  );
}
