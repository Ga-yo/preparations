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
    <section className="rounded border p-4" aria-label="AI 채팅">
      <h2 className="mb-2 font-semibold">AI에게 물어보기</h2>
      <ul className="mb-2 space-y-2 text-sm">
        {log.map((m, i) => (
          <li key={i}>
            <p className="font-medium">나: {m.q}</p>
            <p className="whitespace-pre-line">AI: {m.a}</p>
          </li>
        ))}
      </ul>
      <form onSubmit={send} className="flex gap-2">
        <label className="sr-only" htmlFor="chat-message">질문</label>
        <input id="chat-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000}
          placeholder="예: LTV가 뭐야?" className="min-w-0 flex-1 rounded border px-2 py-1" />
        <button type="submit" disabled={pending} className="rounded bg-foreground px-3 py-1 text-background disabled:opacity-50">
          {pending ? "..." : "보내기"}
        </button>
      </form>
    </section>
  );
}
