export function FavoriteButton({ complexId, name, fav, toggle }: {
  complexId: number; name: string; fav: boolean; toggle: (f: FormData) => Promise<void>;
}) {
  return (
    <form action={toggle}>
      <input type="hidden" name="complex_id" value={complexId} />
      <input type="hidden" name="favorite" value={fav ? "0" : "1"} />
      <button type="submit" aria-pressed={fav} aria-label={fav ? `${name} 관심 해제` : `${name} 관심 단지로 저장`}
        className={`grid size-10 shrink-0 place-items-center rounded-full border text-xl transition ${fav ? "border-chb-accent bg-chb-accent text-white" : "border-chb-line text-chb-muted hover:border-chb-accent hover:text-chb-accent"}`}>
        {fav ? "★" : "☆"}
      </button>
    </form>
  );
}
