"use client";
import { useFavorites } from "./Favorites";

export function FavoriteButton({ complexId, name }: { complexId: number; name: string }) {
  const { favs, toggle } = useFavorites();
  const fav = favs.some((f) => f.complex_id === complexId);
  return (
    <button type="button" onClick={() => toggle({ complex_id: complexId, name }, !fav)}
      aria-pressed={fav} aria-label={fav ? `${name} 관심 해제` : `${name} 관심 단지로 저장`}
      className={`grid size-10 shrink-0 place-items-center rounded-full border text-xl transition ${fav ? "border-chb-accent bg-chb-accent text-white" : "border-chb-line text-chb-muted hover:border-chb-accent hover:text-chb-accent"}`}>
      {fav ? "★" : "☆"}
    </button>
  );
}
