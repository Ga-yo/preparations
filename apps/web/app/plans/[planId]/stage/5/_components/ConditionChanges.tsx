import Link from "next/link";
import type { ToolResult } from "@/lib/agent/tool";
import type { RankingDiff } from "@/lib/calc/scenario";
import { CONDITION_LABELS, ERRORS } from "../../../_components/ConditionCheckCard";

const FIELD_LABELS: Record<string, string> = {
  ...CONDITION_LABELS, region_codes: "희망 지역", housing_types: "주택 유형", price_min: "희망 최저가",
  area_min: "희망 면적(최소)", area_max: "희망 면적(최대)", station_distance_max_m: "지하철역 거리",
  elementary_distance_max_m: "초등학교 거리", rooms_min: "방 개수", baths_min: "욕실 개수",
  floor_pref: "선호 층", direction_pref: "선호 향",
};
const field = (k: string) =>
  k.startsWith("priorities.") ? `${FIELD_LABELS[k.slice(11)] ?? k.slice(11)} 우선순위` : FIELD_LABELS[k] ?? k;

type Data = { changed: string[]; ranking: RankingDiff } | { error: string };
const SHOW = 5;

export function ConditionChanges({ planId, result }: { planId: string; result: ToolResult | null }) {
  const link = (n: number) => <Link href={`/plans/${planId}/stage/${n}`} className="font-semibold text-chb-accent hover:underline">{n}단계</Link>;
  const d = result?.data as Data | undefined;
  return (
    <section className="space-y-4 rounded-3xl border border-chb-line bg-white p-6 text-sm sm:p-8" aria-label="조건 변경에 따른 결과">
      <h2 className="font-display text-xl font-black tracking-tight text-chb-ink">직전 조건 대비 변화</h2>
      {!d ? (
        <p role="alert" className="text-chb-muted">조건 변경 결과를 불러오지 못했습니다.</p>
      ) : "error" in d ? (
        <p className="text-chb-muted">
          {d.error === "no_previous_conditions"
            ? "조건을 바꿔 저장하면 이전 조건과 비교한 후보 변화를 여기서 보여줍니다."
            : ERRORS[d.error] ?? "조건 변경 결과를 불러오지 못했습니다."}{" "}
          {link(2)} · {link(3)}에서 조건을 바꿀 수 있습니다.
        </p>
      ) : (
        <>
          <div>
            <p className="mb-2 font-semibold text-chb-ink">바뀐 조건</p>
            {d.changed.length ? (
              <ul className="flex flex-wrap gap-1.5 text-xs font-semibold">
                {d.changed.map((k) => <li key={k} className="rounded-full bg-chb-soft px-2.5 py-1 text-chb-accent">{field(k)}</li>)}
              </ul>
            ) : <p className="text-chb-muted">없음</p>}
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-chb-soft2 px-5 py-4">
            <span className="text-chb-muted">후보 수 <span className="text-xs">(상위 20개 기준)</span></span>
            <span className="font-display text-2xl font-black text-chb-ink">
              {d.ranking.count_before}<span className="mx-2 text-chb-muted" aria-hidden="true">→</span><span className="sr-only">에서</span>{d.ranking.count_after}<span className="ml-0.5 text-base">개</span>
            </span>
          </div>
          <Moves title="새로 들어온 단지" items={d.ranking.added.slice(0, SHOW).map((x) => `${x.name} ${x.rank}위`)} cls="bg-chb-soft text-chb-accent" />
          <Moves title="빠진 단지" items={d.ranking.removed.slice(0, SHOW).map((x) => `${x.name} (이전 ${x.rank}위)`)} cls="bg-chb-line text-chb-muted" />
          <Moves title="순위가 바뀐 단지" items={d.ranking.moved.slice(0, SHOW).map((x) => `${x.name} ${x.from}→${x.to}위`)} cls="bg-white border border-chb-line text-chb-ink" />
          <p className="text-xs text-chb-muted">다른 조건으로 다시 보려면 {link(2)} · {link(3)}에서 바꿔 저장한 뒤 돌아오세요.</p>
        </>
      )}
    </section>
  );
}

function Moves({ title, items, cls }: { title: string; items: string[]; cls: string }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-2 font-semibold text-chb-ink">{title}</p>
      <ul className="flex flex-wrap gap-1.5 text-xs font-semibold">
        {items.map((s) => <li key={s} className={`rounded-full px-2.5 py-1 ${cls}`}>{s}</li>)}
      </ul>
    </div>
  );
}
