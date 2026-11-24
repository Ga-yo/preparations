"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { FavoriteButton } from "./FavoriteButton";
import { useFavorites } from "./Favorites";
import { LinkPending } from "./LinkPending";

const rowClass = (on: boolean) => `rounded-3xl border-2 bg-white p-5 text-sm transition ${on ? "border-chb-accent bg-chb-soft2" : "border-transparent hover:border-chb-line"}`;

export function CandidateGroups({ planId, items }: { planId: string; items: { id: number; node: ReactNode }[] }) {
  const { favs } = useFavorites();
  const selected = Number(useSearchParams().get("complex"));
  const favIds = new Set(favs.map((f) => f.complex_id));
  const row = ({ id, node }: (typeof items)[number]) => <li key={id} className={rowClass(id === selected)} aria-current={id === selected || undefined}>{node}</li>;
  // 현재 후보 20개 밖의 관심 단지도 보여야 해제할 수 있다
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
                    <span className="text-chb-muted">현재 후보 목록(필수 조건·상위 20개) 밖</span>
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
    </div>
  );
}
