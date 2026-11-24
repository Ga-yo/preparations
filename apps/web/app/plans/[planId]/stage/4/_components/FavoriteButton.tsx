"use client";
import { useOptimistic } from "react";

// 저장은 서버에서 목록 전체를 다시 계산해 느리므로 별은 누르는 즉시 바꿔 둔다
export function FavoriteButton({ complexId, name, fav, toggle }: {
  complexId: number; name: string; fav: boolean; toggle: (f: FormData) => Promise<void>;
}) {
  const [shown, setShown] = useOptimistic(fav);
  return (
    <form action={async (f) => { setShown(!fav); await toggle(f); }}>
      <input type="hidden" name="complex_id" value={complexId} />
      <input type="hidden" name="favorite" value={fav ? "0" : "1"} />
      <button type="submit" aria-pressed={shown} aria-label={shown ? `${name} 관심 해제` : `${name} 관심 단지로 저장`}
        className={`grid size-10 shrink-0 place-items-center rounded-full border text-xl transition ${shown ? "border-chb-accent bg-chb-accent text-white" : "border-chb-line text-chb-muted hover:border-chb-accent hover:text-chb-accent"}`}>
        {shown ? "★" : "☆"}
      </button>
    </form>
  );
}
