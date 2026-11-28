"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AiCheck, ChatTurn, CheckError } from "./assistant";

// "AI가 확인한 것"에 보일 툴 이름 (M7-D2)
const TOOL_LABELS: Record<string, string> = {
  get_budget: "예산 계산", resolve_region: "지역 확인", get_region_prices: "지역 시세", check_conditions: "조건 점검",
  search_complexes: "후보 검색", get_complex_detail: "단지 상세", compare_complexes: "관심 단지 비교",
  compare_condition_changes: "조건 변경 효과", get_tip: "TIP 조회",
};
const CHECK_ERRORS: Record<CheckError, string> = {
  rate_limited: "오늘 AI 사용 횟수를 모두 썼습니다. 내일 다시 이용해 주세요.",
  llm_quota: "지금은 AI 사용량이 많아요. 잠시 후 다시 시도해 주세요.",
  llm_unavailable: "AI 점검을 하지 못했습니다. 잠시 후 다시 시도해 주세요.",
};

export function ChatPanel({ planId, stage, initial, runCheck }: {
  planId: string; stage: number;
  initial: { check: AiCheck | null; suggestions: string[]; history: ChatTurn[] };
  runCheck: () => Promise<{ check: AiCheck } | { error: CheckError }>;
}) {
  const [message, setMessage] = useState("");
  const [log, setLog] = useState<ChatTurn[]>(initial.history);
  const [pending, setPending] = useState(false);
  const [check, setCheck] = useState(initial.check);
  const [suggestions, setSuggestions] = useState(initial.suggestions);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  // 화면 구석에 떠 있는 상담 창. 닫아도 숨기기만 해서 대화·점검 결과가 남는다
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 새 대화·점검 결과가 오면 맨 아래(최신)로 내린다
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length, pending, check, open]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function close() {
    setOpen(false);
    toggleRef.current?.focus();
  }

  async function startCheck() {
    if (checking) return;
    setChecking(true); setCheckError(null);
    try {
      const r = await runCheck();
      if ("error" in r) setCheckError(CHECK_ERRORS[r.error]);
      else { setCheck(r.check); if (r.check.questions.length) setSuggestions(r.check.questions); }
    } catch {
      setCheckError(CHECK_ERRORS.llm_unavailable);
    }
    setChecking(false);
  }

  async function send(e: React.FormEvent | null, text?: string) {
    e?.preventDefault();
    const q = (text ?? message).trim();
    if (!q || pending) return;
    setPending(true);
    let a: string;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan_id: planId, message: q }),
      });
      if (res.ok) a = ((await res.json()) as { reply: string }).reply;
      else if (res.status === 429) a = "오늘 질문 횟수를 모두 사용했습니다. 내일 다시 이용해 주세요.";
      else if (res.status === 503) a = "지금은 AI 답변 한도를 모두 사용했어요. 잠시 후 다시 시도해 주세요.";
      else if (res.status === 502) a = "AI 응답을 받을 수 없습니다. 잠시 후 다시 시도해 주세요.";
      else a = "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    } catch {
      a = "네트워크 오류가 발생했습니다.";
    }
    setLog((l) => [...l, { q, a }]);
    setMessage("");
    setPending(false);
  }

  const badge = !open && ((check && !seen) || checking);
  // 처음엔 작게 열고, 대화·점검 결과가 생기면 넓어진다. 높이는 내용만큼 늘다가 최대 높이부터 대화 칸만 스크롤
  const grown = log.length > 0 || !!check || checking || pending;
  return (
    <>
      <button ref={toggleRef} type="button" aria-expanded={open} aria-controls="ai-chat"
        onClick={() => { if (open) close(); else { setOpen(true); setSeen(true); } }}
        className="fixed right-4 bottom-24 z-40 flex items-center gap-2 rounded-full bg-chb-accent p-4 font-bold text-white shadow-[0_18px_40px_-12px_rgba(20,32,26,0.55)] transition hover:-translate-y-0.5 sm:right-6 sm:bottom-6 sm:px-5 sm:py-3.5 print:hidden">
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4.5h12a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H9l-3.5 3v-3H4A1.5 1.5 0 0 1 2.5 13V6A1.5 1.5 0 0 1 4 4.5Z" />
          <path d="M6.5 9.5h.01M10 9.5h.01M13.5 9.5h.01" strokeWidth="2.4" />
        </svg>
        <span className="sr-only sm:not-sr-only">{open ? "AI 상담 닫기" : "AI 상담"}</span>
        {badge && <span className="absolute top-1 right-1 size-3 rounded-full border-2 border-white bg-amber-400"><span className="sr-only">{checking ? " · 점검하는 중" : " · 새 점검 결과"}</span></span>}
      </button>
      {open && <div aria-hidden="true" onClick={close} className="fixed inset-0 z-40 bg-chb-ink/30 sm:hidden" />}
      <section id="ai-chat" hidden={!open} aria-label="AI 상담"
        className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col overflow-hidden rounded-t-3xl border border-chb-line bg-white shadow-[0_24px_60px_-12px_rgba(20,32,26,0.35)] transition-[width] duration-300 [&[hidden]]:hidden sm:inset-x-auto sm:right-6 sm:bottom-24 sm:max-h-[min(720px,calc(100vh-8rem))] sm:rounded-3xl print:hidden ${grown ? "sm:w-[460px] lg:w-[500px]" : "sm:w-[380px]"}`}>
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-chb-line px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-bold"><span aria-hidden="true" className="size-2 rounded-full bg-chb-accent" />AI 상담</h2>
          <div className="flex items-center gap-1">
            <button type="button" onClick={startCheck} disabled={checking}
              className="rounded-full border border-chb-accent px-3 py-1.5 text-sm font-semibold text-chb-accent disabled:opacity-50">
              {checking ? "점검하는 중…" : check?.fresh ? "AI 점검 다시 보기" : "AI 점검 받기"}
            </button>
            <button type="button" onClick={close} aria-label="AI 상담 닫기" className="grid size-9 place-items-center rounded-full text-xl text-chb-muted hover:bg-chb-soft2 hover:text-chb-ink">×</button>
          </div>
        </div>
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5 text-[15px] leading-relaxed">
          {!check && !log.length && !checking && (
            <p className="rounded-2xl bg-chb-soft2 p-4 text-sm text-chb-muted">
              이 단계에서 궁금한 것을 물어보세요. &lsquo;AI 점검 받기&rsquo;를 누르면 AI가 {stage}단계 입력을 살펴보고 확인할 점을 알려 드려요.
            </p>
          )}
          {checking && <p role="status" className="text-sm text-chb-muted">AI가 {stage}단계 입력을 보고 필요한 계산을 직접 골라 확인하고 있어요. 30초쯤 걸릴 수 있어요.</p>}
          {checkError && <p role="alert" className="text-sm text-red-700">{checkError}</p>}
          {check && (
            <div className="rounded-2xl bg-chb-soft p-4" aria-label="AI 점검 결과">
              <p className="mb-1 font-semibold">AI 점검</p>
              {!check.fresh && <p className="mb-2 text-xs text-chb-muted">입력이 바뀌었거나 날짜가 지나 예전 점검입니다. 다시 받아 보세요.</p>}
              <p className="whitespace-pre-line">{check.summary}</p>
              {check.tools.length > 0 && (
                <p className="mt-2 text-xs text-chb-muted">AI가 확인한 것: {check.tools.map((t) => TOOL_LABELS[t] ?? t).join(" → ")}</p>
              )}
              {check.action && check.fresh && (
                <Link href={`/plans/${planId}/stage/3?prefill=${encodeURIComponent(`${check.action.field}:${check.action.value}`)}`}
                  className="mt-3 inline-block rounded-full bg-chb-accent px-3 py-1.5 text-sm font-semibold text-white">{check.action.label}</Link>
              )}
            </div>
          )}
          {log.length > 0 && (
            <ul className="space-y-4" aria-label="대화">
              {log.map((m, i) => (
                <li key={i}>
                  <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-chb-accent px-4 py-2.5 text-white"><span className="sr-only">나: </span>{m.q}</p>
                  <p className="mt-2 w-fit max-w-[90%] whitespace-pre-line rounded-2xl rounded-bl-md bg-chb-soft2 px-4 py-2.5"><span className="sr-only">AI: </span>{m.a}</p>
                </li>
              ))}
            </ul>
          )}
          {pending && <p role="status" className="w-fit rounded-2xl rounded-bl-md bg-chb-soft2 px-4 py-2.5 text-chb-muted">답변을 준비하고 있어요…</p>}
        </div>
        <div className="shrink-0 space-y-3 border-t border-chb-line px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-5">
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2" aria-label="추천 질문">
              {suggestions.map((s) => (
                <button key={s} type="button" disabled={pending} onClick={() => send(null, s)}
                  className="rounded-full bg-chb-accent-soft px-3 py-1.5 text-left text-sm text-chb-ink disabled:opacity-50">{s}</button>
              ))}
            </div>
          )}
          <form onSubmit={send} className="flex gap-2">
            <label className="sr-only" htmlFor="chat-message">질문</label>
            <input ref={inputRef} id="chat-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000}
              placeholder={`예: ${suggestions[0] ?? "LTV가 뭐야?"}`} className="min-w-0 flex-1 rounded-full border border-chb-line px-4 py-3 outline-none focus:border-chb-accent focus:ring-4 focus:ring-chb-accent-soft" />
            <button type="submit" disabled={pending} className="rounded-full bg-chb-accent px-5 py-3 font-semibold text-white disabled:opacity-50">
              {pending ? "..." : "보내기"}
            </button>
          </form>
        </div>
      </section>
    </>
  );
}
