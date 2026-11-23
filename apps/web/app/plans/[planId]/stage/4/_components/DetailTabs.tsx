"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { nextTabIndex } from "./detail-tabs";

export function DetailTabs({ tabs }: { tabs: { key: string; label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const onKey = (e: KeyboardEvent) => {
    const next = nextTabIndex(active, e.key, tabs.length);
    if (next === active) return;
    e.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  };
  return (
    <>
      <div role="tablist" aria-label="단지 상세 항목" onKeyDown={onKey} className="flex shrink-0 overflow-x-auto border-b border-chb-line">
        {tabs.map((t, i) => (
          <button key={t.key} ref={(el) => { refs.current[i] = el; }} type="button" role="tab" id={`${id}-tab-${t.key}`}
            aria-selected={i === active} aria-controls={`${id}-panel-${t.key}`} tabIndex={i === active ? 0 : -1} onClick={() => setActive(i)}
            className={`-mb-px h-11 shrink-0 whitespace-nowrap px-3 text-sm font-semibold transition ${i === active ? "border-b-2 border-chb-accent text-chb-ink" : "text-chb-muted hover:text-chb-ink"}`}>
            {t.label}
          </button>
        ))}
      </div>
      {/* 숨긴 패널도 그려 둔다: 탭을 오가도 고른 면적·펼침이 남고 aria-controls가 실제 요소를 가리킨다 */}
      {tabs.map((t, i) => (
        <div key={t.key} role="tabpanel" id={`${id}-panel-${t.key}`} aria-labelledby={`${id}-tab-${t.key}`} tabIndex={0} hidden={i !== active}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto py-5 focus-visible:outline-2 focus-visible:outline-chb-accent">
          {t.content}
        </div>
      ))}
    </>
  );
}
