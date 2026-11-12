import { z } from "zod";
import { findConflicts } from "@/lib/calc/conditions";
import { defineTool, type ToolContext, type ToolResult } from "../tool";
import { loadConditionContext, MONTHS } from "./condition-context";

export const checkConditions = defineTool({
  name: "check_conditions",
  description:
    "3단계에 저장한 주택 조건을 예산·지역 시세·건축물대장 단지 데이터와 대조해 충돌(conflicts), 조건별 단지 수(counts), 필수 조건을 만족하는 단지(matches)를 돌려준다. 숫자는 이 결과만 인용한다.",
  schema: z.object({}),
  async run(_args, ctx: ToolContext): Promise<ToolResult> {
    const l = await loadConditionContext(ctx);
    if ("error" in l) return { data: { error: l.error }, as_of: {} };
    const result = findConflicts(l.conditions, l.budgets, l.rows, l.truncated);
    return {
      data: { ...result, criteria: { months: MONTHS } },
      as_of: l.as_of,
      ...(l.stale && { stale: l.stale }),
      ...(l.notices && { notices: l.notices }),
    };
  },
});
