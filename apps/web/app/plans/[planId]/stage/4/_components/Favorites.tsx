"use client";
import { createContext, use, useState, type ReactNode } from "react";

export type Fav = { complex_id: number; name: string };
type Save = (complexId: number, favorite: boolean) => Promise<string | null>;

const ERRORS: Record<string, string> = {
  conditions_required: "관심 단지로 저장하려면 2단계 지역과 3단계 주택 조건을 먼저 저장하세요.",
  not_found: "이 단지를 관심 단지로 저장할 수 없습니다.",
  invalid: "요청이 올바르지 않습니다.",
  failed: "관심 단지를 저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
};

const Ctx = createContext<{ favs: Fav[]; error: string | null; toggle: (f: Fav, on: boolean) => void } | null>(null);

// 목록의 별·상세의 별·비교 버튼이 같은 관심 단지 상태를 본다. 저장은 DB에만 쓰고 후보 목록은 다시 계산하지 않는다
export function FavoritesProvider({ initial, save, children }: { initial: Fav[]; save: Save; children: ReactNode }) {
  const [favs, setFavs] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const without = (list: Fav[], id: number) => list.filter((x) => x.complex_id !== id);
  const toggle = (f: Fav, on: boolean) => {
    setError(null);
    setFavs((cur) => (on ? [...without(cur, f.complex_id), f] : without(cur, f.complex_id)));
    save(f.complex_id, on).catch(() => "failed").then((code) => {
      if (!code) return;
      setFavs((cur) => (on ? without(cur, f.complex_id) : [...without(cur, f.complex_id), f])); // 실패하면 되돌린다
      setError(ERRORS[code] ?? ERRORS.failed);
    });
  };
  return <Ctx value={{ favs, error, toggle }}>{children}</Ctx>;
}

export function useFavorites() {
  const v = use(Ctx);
  if (!v) throw new Error("FavoritesProvider 밖에서 useFavorites를 썼습니다");
  return v;
}

export function FavoriteError() {
  const { error } = useFavorites();
  return error ? <p role="alert" className="rounded-2xl bg-red-50 p-4 text-red-900">{error}</p> : null;
}

export function CompareBar({ toStage5 }: { toStage5: () => Promise<void> }) {
  const n = useFavorites().favs.length;
  if (!n) return null;
  return (
    <form action={toStage5} className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2">
      <button type="submit" disabled={n < 2}
        className="flex items-center gap-5 whitespace-nowrap rounded-full bg-chb-ink py-2.5 pr-2.5 pl-7 text-left text-white shadow-[0_18px_40px_-12px_rgba(20,32,26,0.55)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:hover:translate-y-0">
        <span>
          <span className="block text-xs text-white/70">관심 단지 {n}개</span>
          <span className="block text-lg font-bold">{n < 2 ? "1개 더 고르면 비교할 수 있어요" : "5단계에서 비교하기"}</span>
        </span>
        <span aria-hidden="true" className="grid size-11 place-items-center rounded-full bg-white/15 text-lg">→</span>
      </button>
    </form>
  );
}
