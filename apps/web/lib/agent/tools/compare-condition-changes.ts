import { z } from "zod";
import { rankComplexes } from "@/lib/calc/fit";
import { diffConditions, diffRankings } from "@/lib/calc/scenario";
import { defineTool, type ToolContext, type ToolResult } from "../tool";
import { loadConditionContext } from "./condition-context";

const TOP = 20;

export const compareConditionChanges = defineTool({
  name: "compare_condition_changes",
  description:
    "직전에 저장한 조건과 최신 조건을 비교한다. 바뀐 조건 필드(changed)와 후보 단지 상위 20개의 변화(새로 들어온 단지, 빠진 단지, 순위가 바뀐 단지, 후보 수)를 돌려준다.",
  schema: z.object({}),
  async run(_args, ctx: ToolContext): Promise<ToolResult> {
    const now = await loadConditionContext(ctx, 0);
    if ("error" in now) return { data: { error: now.error }, as_of: {} };
    const prev = await loadConditionContext(ctx, 1);
    const base = { as_of: now.as_of, ...(now.stale && { stale: now.stale }) };
    if ("error" in prev) return { data: { error: "no_previous_conditions" }, ...base };
    return {
      data: {
        changed: diffConditions({ ...prev.conditions, region_codes: prev.regionCodes }, { ...now.conditions, region_codes: now.regionCodes }),
        ranking: diffRankings(rankComplexes(prev.conditions, prev.rows, prev.budgets, TOP), rankComplexes(now.conditions, now.rows, now.budgets, TOP)),
      },
      ...base,
    };
  },
});
