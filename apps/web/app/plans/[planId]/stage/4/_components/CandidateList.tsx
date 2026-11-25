import Link from "next/link";
import type { RankedComplex } from "@/lib/calc/fit";
import { formatWon, livingText } from "../../../_components/format";
import { CandidateGroups, type CandidateItem } from "./CandidateGroups";
import { FavoriteButton } from "./FavoriteButton";
import { FitChips } from "./FitChips";
import { LinkPending } from "./LinkPending";

// 행 내용은 서버에서 한 번 그리고, 관심/일반 묶음과 선택 강조만 화면 쪽에서 정한다
function RowBody({ x, rank, planId }: { x: RankedComplex; rank: number; planId: string }) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <Link href={`/plans/${planId}/stage/4?complex=${x.complex_id}#complex-detail`} className="flex min-w-0 items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-chb-soft text-sm font-bold text-chb-accent">{rank}</span>
          <span className="min-w-0">
            <span className="block text-base font-bold text-chb-ink">{x.name}</span>
            <span className="text-chb-muted">적합도 <b className="text-chb-accent">{x.fit.score}점</b></span>
            <LinkPending />
          </span>
        </Link>
        <FavoriteButton complexId={x.complex_id} name={x.name} />
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
      <div className="mt-3"><FitChips fit={x.fit} /></div>
    </>
  );
}

// 더 불러오기(server action)도 같은 행을 서버에서 그려 보낸다
export const candidateItems = (planId: string, candidates: RankedComplex[], start = 0) =>
  candidates.map((x, i) => ({ id: x.complex_id, node: <RowBody x={x} rank={start + i + 1} planId={planId} /> }));

export function CandidateList({ planId, candidates, total = 0, loadMore }: {
  planId: string; candidates: RankedComplex[]; total?: number; loadMore?: (offset: number) => Promise<CandidateItem[]>;
}) {
  return <CandidateGroups planId={planId} items={candidateItems(planId, candidates)} total={total} loadMore={loadMore} />;
}
