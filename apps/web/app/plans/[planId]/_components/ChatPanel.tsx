"use client";
import Link from "next/link";
import { useState } from "react";
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

  return (
    <section className="rounded-3xl border border-chb-line bg-white p-6" aria-label="AI 채팅">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><span aria-hidden="true" className="size-2 rounded-full bg-chb-accent" />AI 상담</h2>
        <button type="button" onClick={startCheck} disabled={checking}
          className="rounded-full border border-chb-accent px-3 py-1.5 text-sm font-semibold text-chb-accent disabled:opacity-50">
          {checking ? "점검하는 중…" : check?.fresh ? "AI 점검 다시 보기" : "AI 점검 받기"}
        </button>
      </div>
      {checking && <p role="status" className="mb-3 text-sm text-chb-muted">AI가 {stage}단계 입력을 보고 필요한 계산을 직접 골라 확인하고 있어요. 30초쯤 걸릴 수 있어요.</p>}
      {checkError && <p role="alert" className="mb-3 text-sm text-red-700">{checkError}</p>}
      {check && (
        <div className="mb-4 rounded-2xl bg-chb-soft p-4 text-sm" aria-label="AI 점검 결과">
          <p className="mb-1 font-semibold">AI 점검</p>
          {!check.fresh && <p className="mb-2 text-xs text-chb-muted">입력이 바뀌었거나 날짜가 지나 예전 점검입니다. 다시 받아 보세요.</p>}
          <p className="whitespace-pre-line">{check.summary}</p>
          {check.tools.length > 0 && (
            <p className="mt-2 text-xs text-chb-muted">AI가 확인한 것: {check.tools.map((t) => TOOL_LABELS[t] ?? t).join(" → ")}</p>
          )}
          {check.action && check.fresh && (
            <Link href={`/plans/${planId}/stage/3?prefill=${encodeURIComponent(`${check.action.field}:${check.action.value}`)}`}
              className="mt-3 inline-block rounded-full bg-chb-accent px-3 py-1.5 font-semibold text-white">{check.action.label}</Link>
          )}
        </div>
      )}
      <ul className="mb-3 space-y-3 text-sm">
        {log.map((m, i) => (
          <li key={i}>
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-chb-accent px-3 py-2 text-white"><span className="sr-only">나: </span>{m.q}</p>
            <p className="mt-2 w-fit max-w-[85%] whitespace-pre-line rounded-2xl rounded-bl-md bg-chb-soft2 px-3 py-2"><span className="sr-only">AI: </span>{m.a}</p>
          </li>
        ))}
      </ul>
      {suggestions.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2" aria-label="추천 질문">
          {suggestions.map((s) => (
            <button key={s} type="button" disabled={pending} onClick={() => send(null, s)}
              className="rounded-full bg-chb-accent-soft px-3 py-1.5 text-left text-xs text-chb-ink disabled:opacity-50">{s}</button>
          ))}
        </div>
      )}
      <form onSubmit={send} className="flex gap-2">
        <label className="sr-only" htmlFor="chat-message">질문</label>
        <input id="chat-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000}
          placeholder={`예: ${suggestions[0] ?? "LTV가 뭐야?"}`} className="min-w-0 flex-1 rounded-full border border-chb-line px-4 py-2.5 outline-none focus:border-chb-accent focus:ring-4 focus:ring-chb-accent-soft" />
        <button type="submit" disabled={pending} className="rounded-full bg-chb-accent px-4 py-2.5 font-semibold text-white disabled:opacity-50">
          {pending ? "..." : "보내기"}
        </button>
      </form>
    </section>
  );
}
