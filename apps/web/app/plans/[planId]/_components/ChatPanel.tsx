"use client";
import { useState } from "react";

export function ChatPanel({ planId }: { planId: string }) {
  const [message, setMessage] = useState("");
  const [log, setLog] = useState<{ q: string; a: string }[]>([]);
  const [pending, setPending] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const q = message.trim();
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
      <h2 className="mb-3 flex items-center gap-2 font-semibold"><span aria-hidden="true" className="size-2 rounded-full bg-chb-accent" />AI에게 물어보기</h2>
      <ul className="mb-3 space-y-3 text-sm">
        {log.map((m, i) => (
          <li key={i}>
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-chb-accent px-3 py-2 text-white"><span className="sr-only">나: </span>{m.q}</p>
            <p className="mt-2 w-fit max-w-[85%] whitespace-pre-line rounded-2xl rounded-bl-md bg-chb-soft2 px-3 py-2"><span className="sr-only">AI: </span>{m.a}</p>
          </li>
        ))}
      </ul>
      <form onSubmit={send} className="flex gap-2">
        <label className="sr-only" htmlFor="chat-message">질문</label>
        <input id="chat-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000}
          placeholder="예: LTV가 뭐야?" className="min-w-0 flex-1 rounded-full border border-chb-line px-4 py-2.5 outline-none focus:border-chb-accent focus:ring-4 focus:ring-chb-accent-soft" />
        <button type="submit" disabled={pending} className="rounded-full bg-chb-accent px-4 py-2.5 font-semibold text-white disabled:opacity-50">
          {pending ? "..." : "보내기"}
        </button>
      </form>
    </section>
  );
}
