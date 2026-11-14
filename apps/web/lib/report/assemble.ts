// M6b 구매 검토 리포트 스냅숏. 숫자는 툴 결과를 그대로 담고 새로 계산하지 않는다(원칙 1). 순수 함수.
import type { ToolResult } from "@/lib/agent/tool";

export interface ReportConditions {
  region_names: string[]; region_reason: string | null; commute_region_name: string | null;
  area_min: number | null; area_max: number | null; price_max: number | null; redevelopment_interest: boolean;
}
export interface ReportChecklistItem { field_key: string | null; title: string; body: string; caution: string | null }
export interface ReportPayload {
  version: 1; generated_on: string;
  budget: ToolResult; conditions: ReportConditions | null;
  favorites: { complex_id: number; name: string }[];
  compare: ToolResult | null; // 관심 단지가 2개 이상일 때만
  checklist: ReportChecklistItem[];
  as_of: Record<string, string>; notices: string[];
}

export function assembleReport(p: Omit<ReportPayload, "version" | "as_of" | "notices">): ReportPayload {
  const notices = [...(p.budget.notices ?? []), ...(p.compare?.notices ?? []), ...(p.favorites.length < 2 ? ["need_two_favorites"] : [])];
  return { version: 1, ...p, as_of: { ...p.budget.as_of, ...p.compare?.as_of }, notices: [...new Set(notices)] };
}

type ConditionRow = {
  region_codes: string[]; region_reason: string | null; commute_region_code: string | null;
  area_min: number | null; area_max: number | null; price_max: number | null; redevelopment_interest: boolean | null;
};

export function conditionsSummary(row: ConditionRow | null, names: Record<string, string>): ReportConditions | null {
  if (!row) return null;
  return {
    region_names: row.region_codes.map((c) => names[c] ?? c), region_reason: row.region_reason,
    commute_region_name: row.commute_region_code ? names[row.commute_region_code] ?? row.commute_region_code : null,
    area_min: row.area_min, area_max: row.area_max, price_max: row.price_max, redevelopment_interest: !!row.redevelopment_interest,
  };
}
