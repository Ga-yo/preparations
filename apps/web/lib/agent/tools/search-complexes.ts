import { z } from "zod";
import { findConflicts, noPoiData } from "@/lib/calc/conditions";
import { rankComplexes } from "@/lib/calc/fit";
import { defineTool, type ToolContext, type ToolResult } from "../tool";
import { loadConditionContext, MONTHS } from "./condition-context";

const PASSTHROUGH = ["no_data_for_type", "no_complex_data", "truncated", "land_share_is_average", "location_partial", "no_poi_data"];

export const searchComplexes = defineTool({
  name: "search_complexes",
  description:
    "저장된 지역·주택 조건으로 필수 조건을 통과한 후보 단지를 적합도(fit) 순으로 돌려준다. fit.met/unmet/missing이 추천 근거이고 within_budget은 참고값이다. 후보가 없으면 blocking에 막는 조건이 담긴다.",
  schema: z.object({ limit: z.number().int().min(1).max(50).default(20) }),
  async run(args, ctx: ToolContext): Promise<ToolResult> {
    const l = await loadConditionContext(ctx);
    if ("error" in l) return { data: { error: l.error }, as_of: {} };
    const { conflicts, notices, counts } = findConflicts(l.conditions, l.budgets, l.rows, l.truncated);
    const candidates = rankComplexes(l.conditions, l.rows, l.budgets, args.limit ?? 20);
    const blocking = candidates.length
      ? undefined
      : conflicts.find((c) => c.code === "no_match_for_musts")?.blocking;
    return {
      data: { candidates, total: counts.must, ...(blocking && { blocking }), criteria: { months: MONTHS } },
      as_of: l.as_of,
      ...(l.stale && { stale: l.stale }),
      notices: [...(l.notices ?? []), ...notices.filter((n) => PASSTHROUGH.includes(n)), ...(noPoiData(l.rows) ? ["no_location_data"] : [])],
    };
  },
});
