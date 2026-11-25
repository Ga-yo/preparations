"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { FavoriteButton } from "./FavoriteButton";
import { useFavorites } from "./Favorites";
import { LinkPending } from "./LinkPending";

const rowClass = (on: boolean) => `rounded-3xl border-2 bg-white p-5 text-sm transition ${on ? "border-chb-accent bg-chb-soft2" : "border-transparent hover:border-chb-line"}`;

export type CandidateItem = { id: number; node: ReactNode };

export function CandidateGroups({ planId, items: first, total = 0, loadMore }: {
  planId: string; items: CandidateItem[]; total?: number; loadMore?: (offset: number) => Promise<CandidateItem[]>;
}) {
  const { favs } = useFavorites();
  const [items, setItems] = useState(first);
  const [state, setState] = useState<"idle" | "loading" | "error" | "done">("idle");
  const sentinel = useRef<HTMLDivElement>(null);
  const hasMore = !!loadMore && state !== "done" && items.length < total;
  // 목록 끝이 화면에 들어오면 다음 20개를 붙인다. 실패하면 버튼으로 다시 시도한다
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || state !== "idle") return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      setState("loading");
      loadMore!(items.length).then(
        (more) => {
          setItems((prev) => [...prev, ...more.filter((m) => !prev.some((p) => p.id === m.id))]);
          setState(more.length ? "idle" : "done");
        },
        () => setState("error"),
      );
    }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, state, items.length, loadMore]);
  const selected = Number(useSearchParams().get("complex"));
  const favIds = new Set(favs.map((f) => f.complex_id));
  const row = ({ id, node }: (typeof items)[number]) => <li key={id} className={rowClass(id === selected)} aria-current={id === selected || undefined}>{node}</li>;
  // 불러온 후보 밖의 관심 단지도 보여야 해제할 수 있다
  const outside = favs.filter((f) => !items.some((x) => x.id === f.complex_id));
  return (
    <div className="space-y-3">
      {favs.length > 0 && (
        <section aria-label="관심 단지">
          <h3 className="mb-2 font-bold"><span className="text-chb-accent">★</span> 관심 단지</h3>
          <ul className="space-y-2">
            {items.filter((x) => favIds.has(x.id)).map(row)}
            {outside.map((f) => (
              <li key={f.complex_id} className={rowClass(f.complex_id === selected)} aria-current={f.complex_id === selected || undefined}>
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/plans/${planId}/stage/4?complex=${f.complex_id}#complex-detail`} className="min-w-0">
                    <span className="block text-base font-bold text-chb-ink">{f.name}</span>
                    <span className="text-chb-muted">불러온 후보 목록 밖</span>
                    <LinkPending />
                  </Link>
                  <FavoriteButton complexId={f.complex_id} name={f.name} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {items.length > 0 && <ul className="space-y-2">{items.filter((x) => !favIds.has(x.id)).map(row)}</ul>}
      {hasMore && (
        <div ref={sentinel} className="py-4 text-center text-sm text-chb-muted" aria-live="polite">
          {state === "error"
            ? <button type="button" onClick={() => setState("idle")} className="font-semibold text-chb-accent hover:underline">불러오지 못했어요. 다시 시도</button>
            : `후보 더 불러오는 중… (${items.length.toLocaleString("ko-KR")}/${total.toLocaleString("ko-KR")})`}
        </div>
      )}
    </div>
  );
}
