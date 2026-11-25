// 단계별 기본 추천 질문(M7-D3). AI 점검 전·실패 시 칩과 placeholder에 쓴다. 입력값만 보는 순수 함수, LLM 호출 없음
export type SuggestionInput = {
  profile: {
    purpose?: string | null; timeline?: string | null; existing_debt?: number | null; owned_house_count?: number | null;
    is_first_time?: boolean | null; is_newlywed?: boolean | null; has_newborn?: boolean | null; income_is_combined?: boolean | null;
  } | null;
  cond: {
    region_codes?: string[] | null; commute_region_code?: string | null; commute_station?: string | null; school_importance?: number | null;
    price_max?: number | null; redevelopment_interest?: boolean | null; priorities?: unknown;
  } | null;
  favoriteCount: number;
};

const MAX = 3;

export function ruleQuestions(stage: number, { profile: p, cond: c, favoriteCount }: SuggestionInput): string[] {
  const q: (string | false | null | undefined)[] = [];
  if (stage === 1) {
    q.push(
      p?.is_first_time && "생애최초면 취득세 감면을 받을 수 있나요?",
      (p?.is_newlywed || p?.has_newborn) && "신혼부부·출산 가구 정책대출을 받을 수 있나요?",
      !!p?.existing_debt && "기존 대출이 대출 한도를 얼마나 줄이나요?",
      (p?.owned_house_count ?? 0) > 0 && "집이 이미 있으면 취득세가 어떻게 달라지나요?",
      (p?.timeline === "2_3y" || p?.timeline === "undecided") && "구매 시기가 늦어지면 대출 규제가 달라질 수 있나요?",
      p?.income_is_combined && "부부 합산 소득이면 DSR은 어떻게 계산되나요?",
      p?.purpose !== "live" && p?.purpose && "투자 목적이면 대출이나 세금이 달라지나요?",
      "LTV와 DSR은 무엇인가요?", "집을 살 때 드는 부대비용은 무엇이 있나요?", "매매가와 실거래가는 어떻게 다른가요?",
    );
  } else if (stage === 2) {
    q.push(
      !c?.region_codes?.length && "내 예산으로 갈 수 있는 지역을 추천해 주세요",
      !!(c?.commute_region_code || c?.commute_station) && "직장 가까운 지역 중 예산에 맞는 곳은 어디인가요?",
      (c?.school_importance ?? 0) >= 4 && "초등학교 가까운 단지를 찾으려면 어떻게 해야 하나요?",
      "희망 지역의 시세는 어느 정도인가요?", "전용면적과 공급면적은 어떻게 다른가요?",
    );
  } else if (stage === 3) {
    const musts = Object.values((c?.priorities ?? {}) as Record<string, string>).filter((v) => v === "must").length;
    q.push(
      c?.price_max == null && "희망 최고가는 어떻게 잡는 게 좋을까요?",
      musts >= 3 && "필수 조건이 많으면 후보가 줄지 않나요?",
      c?.redevelopment_interest && "오래된 단지의 재건축 가능성은 어떻게 판단하나요?",
      "내 조건끼리 충돌하는 게 있나요?", "용적률과 건폐율은 무엇을 뜻하나요?",
    );
  } else if (stage === 4) {
    q.push(
      favoriteCount < 2 && "후보 단지들의 장단점을 비교해 주세요",
      "실거래가와 호가는 어떻게 다른가요?", "후보가 적으면 어떤 조건을 바꿔 볼 수 있나요?",
    );
  } else {
    q.push(
      favoriteCount < 2 && "관심 단지는 몇 개를 비교하는 게 좋나요?",
      "관심 단지 중 예산에 무리 없는 곳은 어디인가요?", "계약 전에 꼭 확인할 것은 무엇인가요?",
      "조건을 바꾸면 후보가 어떻게 달라지나요?",
    );
  }
  return q.filter((s): s is string => typeof s === "string").slice(0, MAX);
}
