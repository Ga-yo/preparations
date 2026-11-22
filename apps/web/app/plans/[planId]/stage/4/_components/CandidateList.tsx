import Link from "next/link";
import type { RankedComplex } from "@/lib/calc/fit";
import { CONDITION_LABELS } from "../../../_components/ConditionCheckCard";
import { formatWon, livingText } from "../../../_components/format";

const BUDGET = (b: boolean | null) =>
  b === true ? { text: "예산 안", cls: "bg-chb-accent text-white" }
  : b === false ? { text: "예산 밖", cls: "bg-red-50 text-red-800" }
  : { text: "예산 판단 불가", cls: "bg-chb-line text-chb-muted" };
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
    <li className={`rounded-3xl border-2 bg-white p-5 text-sm transition ${selected ? "border-chb-accent bg-chb-soft2" : "border-transparent hover:border-chb-line"}`}>
      <div className="flex items-start justify-between gap-3">
        <Link href={`/plans/${planId}/stage/4?complex=${x.complex_id}#complex-detail`} className="flex min-w-0 items-start gap-3" aria-current={selected || undefined}>
          {rank !== null && <span className="grid size-8 shrink-0 place-items-center rounded-full bg-chb-soft text-sm font-bold text-chb-accent">{rank}</span>}
          <span className="min-w-0">
            <span className="block text-base font-bold text-chb-ink">{x.name}</span>
            <span className="text-chb-muted">적합도 <b className="text-chb-accent">{x.fit.score}점</b></span>
          </span>
        </Link>
        <form action={toggle}>
          <input type="hidden" name="complex_id" value={x.complex_id} />
          <input type="hidden" name="favorite" value={fav ? "0" : "1"} />
          <button type="submit" aria-pressed={fav} aria-label={fav ? `${x.name} 관심 해제` : `${x.name} 관심 단지로 저장`}
            className={`grid size-10 place-items-center rounded-full border text-xl transition ${fav ? "border-chb-accent bg-chb-accent text-white" : "border-chb-line text-chb-muted hover:border-chb-accent hover:text-chb-accent"}`}>
            {fav ? "★" : "☆"}
          </button>
        </form>
      </div>
      <p className="mt-3 text-chb-muted">
        <span className="mr-1 font-display text-lg font-black text-chb-ink">{x.median_price === null ? "최근 거래 없음" : formatWon(x.median_price)}</span>
        최근 12개월 중위가 · 거래 {x.deal_count}건 · {x.approval_year ?? "-"}년 승인 · {x.household_count?.toLocaleString("ko-KR") ?? "-"}세대
      </p>
      <p className="mt-1 text-chb-muted">
        {x.nearest_station_m === null && x.nearest_elementary_m === null ? "위치 정보 없음"
          : `${x.nearest_station_m === null ? "역 정보 없음" : `역 ${x.nearest_station_name ?? "-"} 직선 ${x.nearest_station_m}m`} · ${x.nearest_elementary_m === null ? "초등학교 정보 없음" : `초등학교 직선 ${x.nearest_elementary_m}m`}`}
      </p>
      {livingText(x) && <p className="text-chb-muted">{livingText(x)}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5 text-xs font-semibold">
        <span className={`rounded-full px-2.5 py-1 ${b.cls}`}>{b.text}</span>
        {x.fit.met.map((k) => <span key={k} className="rounded-full bg-chb-soft px-2.5 py-1 text-chb-accent">충족 {label(k)}</span>)}
        {unmet.map((k) => <span key={k} className="rounded-full bg-chb-line px-2.5 py-1 text-chb-muted">맞지 않음 {label(k)}</span>)}
        {x.fit.missing.map((k) => <span key={k} className="rounded-full border border-dashed border-chb-muted/50 px-2.5 py-1 text-chb-muted">데이터 없음 {label(k)}</span>)}
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
          <h3 className="mb-2 font-bold"><span className="text-chb-accent">★</span> 관심 단지</h3>
          <ul className="space-y-2">
            {favs.map(({ x }) => <Row key={x.complex_id} x={x} rank={null} fav selected={x.complex_id === selected} planId={planId} toggle={toggle} />)}
            {outside.map((f) => (
              <li key={f.complex_id} className={`rounded-3xl border-2 bg-white p-5 text-sm ${f.complex_id === selected ? "border-chb-accent bg-chb-soft2" : "border-transparent"}`}>
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/plans/${planId}/stage/4?complex=${f.complex_id}#complex-detail`} className="min-w-0" aria-current={f.complex_id === selected || undefined}>
                    <span className="block text-base font-bold text-chb-ink">{f.name}</span>
                    <span className="text-chb-muted">현재 후보 목록(필수 조건·상위 20개) 밖</span>
                  </Link>
                  <form action={toggle}>
                    <input type="hidden" name="complex_id" value={f.complex_id} />
                    <input type="hidden" name="favorite" value="0" />
                    <button type="submit" aria-pressed aria-label={`${f.name} 관심 해제`} className="grid size-10 place-items-center rounded-full border border-chb-accent bg-chb-accent text-xl text-white">★</button>
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
