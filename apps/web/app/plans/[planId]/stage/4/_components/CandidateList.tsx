import Link from "next/link";
import type { RankedComplex } from "@/lib/calc/fit";
import { CONDITION_LABELS } from "../../../_components/ConditionCheckCard";
import { formatWon } from "../../../_components/format";

const BUDGET = (b: boolean | null) =>
  b === true ? { text: "예산 안", cls: "bg-green-100 text-green-900" }
  : b === false ? { text: "예산 밖", cls: "bg-red-100 text-red-900" }
  : { text: "예산 판단 불가", cls: "bg-gray-100 text-gray-700" };
const label = (k: string) => CONDITION_LABELS[k] ?? k;

type Props = {
  planId: string; candidates: RankedComplex[]; favorites: { complex_id: number; name: string }[]; selected: number | null;
  toggle: (form: FormData) => Promise<void>;
};

function Row({ x, rank, fav, selected, planId, toggle }: {
  x: RankedComplex; rank: number | null; fav: boolean; selected: boolean; planId: string; toggle: Props["toggle"];
}) {
  const b = BUDGET(x.fit.within_budget);
  const unmet = x.fit.unmet.filter((k) => !x.fit.missing.includes(k));
  return (
    <li className={`rounded border p-2 text-sm ${selected ? "border-blue-600 bg-blue-50" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <Link href={`/plans/${planId}/stage/4?complex=${x.complex_id}#complex-detail`} className="font-medium text-blue-800" aria-current={selected || undefined}>
          {rank === null ? "" : `${rank}. `}{x.name} <span className="font-normal text-gray-600">· 적합도 {x.fit.score}점</span>
        </Link>
        <form action={toggle}>
          <input type="hidden" name="complex_id" value={x.complex_id} />
          <input type="hidden" name="favorite" value={fav ? "0" : "1"} />
          <button type="submit" aria-pressed={fav} aria-label={fav ? `${x.name} 관심 해제` : `${x.name} 관심 단지로 저장`}>
            {fav ? "★" : "☆"}
          </button>
        </form>
      </div>
      <p className="text-gray-700">
        최근 12개월 중위가 {x.median_price === null ? "최근 거래 없음" : formatWon(x.median_price)} · 거래 {x.deal_count}건 ·
        {" "}{x.approval_year ?? "-"}년 승인 · {x.household_count?.toLocaleString("ko-KR") ?? "-"}세대
      </p>
      <p className="text-gray-700">
        {x.nearest_station_m === null && x.nearest_elementary_m === null ? "위치 정보 없음"
          : `${x.nearest_station_m === null ? "역 정보 없음" : `역 ${x.nearest_station_name ?? "-"} 직선 ${x.nearest_station_m}m`} · ${x.nearest_elementary_m === null ? "초등학교 정보 없음" : `초등학교 직선 ${x.nearest_elementary_m}m`}`}
      </p>
      <div className="mt-1 flex flex-wrap gap-1 text-xs">
        <span className={`rounded px-1.5 py-0.5 ${b.cls}`}>{b.text}</span>
        {x.fit.met.map((k) => <span key={k} className="rounded bg-green-50 px-1.5 py-0.5 text-green-800">충족 {label(k)}</span>)}
        {unmet.map((k) => <span key={k} className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-700">맞지 않음 {label(k)}</span>)}
        {x.fit.missing.map((k) => <span key={k} className="rounded border border-dashed px-1.5 py-0.5 text-gray-600">데이터 없음 {label(k)}</span>)}
      </div>
    </li>
  );
}

export function CandidateList({ planId, candidates, favorites, selected, toggle }: Props) {
  const favIds = new Set(favorites.map((f) => f.complex_id));
  const ranked = candidates.map((x, i) => ({ x, rank: i + 1 }));
  const favs = ranked.filter(({ x }) => favIds.has(x.complex_id));
  const rest = ranked.filter(({ x }) => !favIds.has(x.complex_id));
  // 현재 후보 20개 밖의 관심 단지도 보여야 해제할 수 있다
  const outside = favorites.filter((f) => !candidates.some((x) => x.complex_id === f.complex_id));
  const row = ({ x, rank }: (typeof ranked)[number]) => (
    <Row key={x.complex_id} x={x} rank={rank} fav={favIds.has(x.complex_id)} selected={x.complex_id === selected} planId={planId} toggle={toggle} />
  );
  return (
    <div className="space-y-3">
      {(favs.length > 0 || outside.length > 0) && (
        <section aria-label="관심 단지">
          <h3 className="mb-1 text-sm font-semibold">★ 관심 단지</h3>
          <ul className="space-y-2">
            {favs.map(({ x }) => <Row key={x.complex_id} x={x} rank={null} fav selected={x.complex_id === selected} planId={planId} toggle={toggle} />)}
            {outside.map((f) => (
              <li key={f.complex_id} className={`rounded border p-2 text-sm ${f.complex_id === selected ? "border-blue-600 bg-blue-50" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/plans/${planId}/stage/4?complex=${f.complex_id}#complex-detail`} className="font-medium text-blue-800" aria-current={f.complex_id === selected || undefined}>
                    {f.name} <span className="font-normal text-gray-600">· 현재 후보 목록(필수 조건·상위 20개) 밖</span>
                  </Link>
                  <form action={toggle}>
                    <input type="hidden" name="complex_id" value={f.complex_id} />
                    <input type="hidden" name="favorite" value="0" />
                    <button type="submit" aria-pressed aria-label={`${f.name} 관심 해제`}>★</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ul className="space-y-2">{rest.map(row)}</ul>
    </div>
  );
}
