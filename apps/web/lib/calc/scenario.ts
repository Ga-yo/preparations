// 5단계 조건 변경 비교: 직전 조건 세트와 최신 조건 세트의 차이, 후보 순위 변화. 순수 함수 (M5-D5).
import type { Conditions } from "./conditions";
import type { RankedComplex } from "./fit";

type Saved = Conditions & { region_codes: string[] };
export interface RankingDiff {
  added: { complex_id: number; name: string; rank: number }[];
  removed: { complex_id: number; name: string; rank: number }[];
  moved: { complex_id: number; name: string; from: number; to: number }[];
  count_before: number; count_after: number;
}

const same = (a: unknown, b: unknown) =>
  Array.isArray(a) && Array.isArray(b) ? a.length === b.length && [...a].sort().join() === [...b].sort().join() : a === b;

export function diffConditions(before: Saved, after: Saved): string[] {
  const fields = (Object.keys(after) as (keyof Saved)[]).filter((k) => k !== "priorities" && !same(before[k], after[k]));
  const keys = [...new Set([...Object.keys(before.priorities), ...Object.keys(after.priorities)])];
  const prio = keys.filter((k) => (before.priorities[k] ?? "prefer") !== (after.priorities[k] ?? "prefer")).map((k) => `priorities.${k}`);
  return [...fields, ...prio];
}

export function diffRankings(before: RankedComplex[], after: RankedComplex[]): RankingDiff {
  const rank = (list: RankedComplex[]) => new Map(list.map((x, i) => [x.complex_id, i + 1]));
  const b = rank(before);
  const a = rank(after);
  return {
    added: after.filter((x) => !b.has(x.complex_id)).map((x) => ({ complex_id: x.complex_id, name: x.name, rank: a.get(x.complex_id)! })),
    removed: before.filter((x) => !a.has(x.complex_id)).map((x) => ({ complex_id: x.complex_id, name: x.name, rank: b.get(x.complex_id)! })),
    moved: after.filter((x) => b.has(x.complex_id) && b.get(x.complex_id) !== a.get(x.complex_id))
      .map((x) => ({ complex_id: x.complex_id, name: x.name, from: b.get(x.complex_id)!, to: a.get(x.complex_id)! })),
    count_before: before.length, count_after: after.length,
  };
}
