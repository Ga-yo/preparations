import Link from "next/link";
import type { ToolResult } from "@/lib/agent/tool";
import type { RankingDiff } from "@/lib/calc/scenario";
import { CONDITION_LABELS, ERRORS } from "../../../_components/ConditionCheckCard";

const FIELD_LABELS: Record<string, string> = {
  ...CONDITION_LABELS, region_codes: "희망 지역", housing_types: "주택 유형", price_min: "희망 최저가",
  area_min: "희망 면적(최소)", area_max: "희망 면적(최대)", station_distance_max_m: "지하철역 거리",
  elementary_distance_max_m: "초등학교 거리", mgmt_fee_per_m2_max: "관리비", rooms_min: "방 개수", baths_min: "욕실 개수",
  floor_pref: "선호 층", direction_pref: "선호 향",
};
const field = (k: string) =>
  k.startsWith("priorities.") ? `${FIELD_LABELS[k.slice(11)] ?? k.slice(11)} 우선순위` : FIELD_LABELS[k] ?? k;

type Data = { changed: string[]; ranking: RankingDiff } | { error: string };
const SHOW = 5;

export function ConditionChanges({ planId, result }: { planId: string; result: ToolResult | null }) {
  const link = (n: number) => <Link href={`/plans/${planId}/stage/${n}`} className="text-blue-700">{n}단계</Link>;
  const d = result?.data as Data | undefined;
  return (
    <section className="space-y-2 rounded border p-3 text-sm" aria-label="조건 변경에 따른 결과">
      <h2 className="font-semibold">직전 조건 대비 변화</h2>
      {!d ? (
        <p role="alert">조건 변경 결과를 불러오지 못했습니다.</p>
      ) : "error" in d ? (
        <p>
          {d.error === "no_previous_conditions"
            ? "조건을 바꿔 저장하면 이전 조건과 비교한 후보 변화를 여기서 보여줍니다."
            : ERRORS[d.error] ?? "조건 변경 결과를 불러오지 못했습니다."}{" "}
          {link(2)} · {link(3)}에서 조건을 바꿀 수 있습니다.
        </p>
      ) : (
        <>
          <p>바뀐 조건: {d.changed.length ? d.changed.map(field).join(", ") : "없음"}</p>
          <p>후보 수(상위 20개 기준): {d.ranking.count_before}개 → {d.ranking.count_after}개</p>
          {d.ranking.added.length > 0 && <p>새로 들어온 단지: {d.ranking.added.slice(0, SHOW).map((x) => `${x.name}(${x.rank}위)`).join(", ")}</p>}
          {d.ranking.removed.length > 0 && <p>빠진 단지: {d.ranking.removed.slice(0, SHOW).map((x) => `${x.name}(이전 ${x.rank}위)`).join(", ")}</p>}
          {d.ranking.moved.length > 0 && <p>순위가 바뀐 단지: {d.ranking.moved.slice(0, SHOW).map((x) => `${x.name}(${x.from}→${x.to}위)`).join(", ")}</p>}
          <p className="text-xs text-gray-600">다른 조건으로 다시 보려면 {link(2)} · {link(3)}에서 바꿔 저장한 뒤 돌아오세요.</p>
        </>
      )}
    </section>
  );
}
