import type { AreaType, BuyerType, LoanRule, RegulatedArea } from "./types";

export function buyerTypeOf(p: {
  ownedHouseCount: number;
  isFirstTime: boolean | null;
}): BuyerType {
  if (p.ownedHouseCount >= 2) return "multi_house";
  if (p.ownedHouseCount === 1) return "one_house";
  return p.isFirstTime ? "first_time" : "homeless";
}

// 법정동코드 행정 단계별 비교 접두. 일반구(수원시 4111100000 등)가 있는 시는 앞 4자리로 묶는다.
function codePrefix(code: string): string {
  if (code.endsWith("00000000")) return code.slice(0, 2);
  if (code.endsWith("00000")) return code[4] === "0" ? code.slice(0, 4) : code.slice(0, 5);
  if (code.endsWith("00")) return code.slice(0, 8);
  return code;
}

export function activeAreaTypes(
  regionCode: string,
  areas: RegulatedArea[],
  date: string,
): AreaType[] {
  const types = areas
    .filter(
      (a) =>
        a.effective_date <= date &&
        (a.end_date === null || date <= a.end_date) &&
        regionCode.startsWith(codePrefix(a.region_code)),
    )
    .map((a) => a.area_type as AreaType);
  return [...new Set(types)];
}

type Ctx = {
  date: string;
  price: number;
  buyerType: BuyerType;
  areaTypes: AreaType[];
  regionCode: string | null;
  lenderType: "bank" | "non_bank" | "policy";
};

function matches(r: LoanRule, c: Ctx): boolean {
  if (r.effective_date > c.date || (r.end_date !== null && r.end_date < c.date)) return false;
  if (r.price_min !== null && c.price < r.price_min) return false;
  if (r.price_max !== null && c.price >= r.price_max) return false;
  if (r.lender_type !== null && r.lender_type !== c.lenderType) return false;
  if (
    r.buyer_type !== null &&
    r.buyer_type !== c.buyerType &&
    !(r.buyer_type === "homeless" && c.buyerType === "first_time")
  )
    return false;
  if (r.area_type === "regulated") {
    if (c.areaTypes.length === 0) return false;
  } else if (r.area_type === "non_regulated") {
    if (c.areaTypes.length > 0) return false;
  } else if (r.area_type !== null && !c.areaTypes.includes(r.area_type as AreaType)) {
    return false;
  }
  if (r.region_prefix !== null && !(c.regionCode?.startsWith(r.region_prefix) ?? false))
    return false;
  return true;
}

const specificity = (r: LoanRule) =>
  [r.price_min, r.price_max, r.lender_type, r.buyer_type, r.area_type, r.region_prefix].filter(
    (v) => v !== null,
  ).length;

/** 조건에 맞는 가장 구체적인 규칙. 없으면 null(기본값을 만들지 않는다). */
export function selectRule(
  rules: LoanRule[],
  ruleType: LoanRule["rule_type"],
  ctx: Ctx,
): LoanRule | null {
  let best: LoanRule | null = null;
  for (const r of rules) {
    if (r.rule_type !== ruleType || !matches(r, ctx)) continue;
    if (
      best === null ||
      specificity(r) > specificity(best) ||
      (specificity(r) === specificity(best) && r.effective_date > best.effective_date)
    )
      best = r;
  }
  return best;
}
