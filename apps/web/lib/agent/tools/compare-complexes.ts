import { z } from "zod";
import { compareComplexes, type CompareInput } from "@/lib/calc/compare";
import { activeKeys, type ComplexRow } from "@/lib/calc/conditions";
import { fitScore, maxBudgetFor } from "@/lib/calc/fit";
import { defineTool, type ToolContext, type ToolResult } from "../tool";
import { loadConditionContext, MONTHS } from "./condition-context";

export const compareComplexesTool = defineTool({
  name: "compare_complexes",
  description:
    "관심 단지 2~4개를 결정론적으로 비교한다. 단지별 적합도(fit), 위험 요소 코드(risks), 최저가 대비 가격 차이(price_gap_from_min), 예산 대비 비율(budget_ratio), 지표별 유리한 단지(best)를 돌려준다. 현재 조건 밖 단지는 fit이 null이다.",
  schema: z.object({ complex_ids: z.array(z.number().int().positive()).min(1).max(4) }),
  async run(args, ctx: ToolContext): Promise<ToolResult> {
    const ids = [...new Set(args.complex_ids)];
    const l = await loadConditionContext(ctx);
    if ("error" in l) return { data: { error: l.error }, as_of: {} };
    const { area_min, area_max } = l.conditions;
    const active = activeKeys(l.conditions, l.rows);

    const inside = new Map(l.rows.filter((r) => ids.includes(r.complex_id)).map((r) => [r.complex_id, r]));
    const missing = ids.filter((id) => !inside.has(id));
    const outside = new Map<number, ComplexRow>();
    if (missing.length) {
      // 조건을 바꾼 뒤 남은 관심 단지: 그 단지 법정동으로 같은 면적 범위 행을 다시 읽는다
      const { data: cs, error } = await ctx.supabase.from("complexes").select("id, region_code").in("id", missing);
      if (error) throw new Error(error.message);
      const codes = [...new Set((cs ?? []).map((c) => c.region_code))];
      if (codes.length) {
        const rpc = await ctx.supabase.rpc("complexes_for_conditions", {
          region_codes: codes, months: MONTHS,
          ...(area_min !== null && { area_min }), ...(area_max !== null && { area_max }),
        });
        if (rpc.error) throw new Error(rpc.error.message);
        for (const r of (rpc.data ?? []) as ComplexRow[]) if (missing.includes(r.complex_id)) outside.set(r.complex_id, r);
      }
    }

    const inputs: CompareInput[] = ids.flatMap((id): CompareInput[] => {
      const r = inside.get(id);
      if (r) return [{ row: r, fit: fitScore(l.conditions, r, maxBudgetFor(l.budgets, r), active), max_budget: maxBudgetFor(l.budgets, r), in_conditions: true }];
      const o = outside.get(id);
      return o ? [{ row: o, fit: null, max_budget: maxBudgetFor(l.budgets, o), in_conditions: false }] : [];
    });
    const notices = [...(l.notices ?? []), ...(inputs.length < ids.length ? ["complex_not_found"] : []), "land_share_is_average", "no_redevelopment_data"];
    const base = { as_of: l.as_of, ...(l.stale && { stale: l.stale }), notices };
    if (inputs.length < 2) return { data: { error: "need_two_or_more" }, ...base };
    return {
      data: { ...compareComplexes(inputs, Number(ctx.today.slice(0, 4))), rows: inputs.map((i) => i.row), criteria: { months: MONTHS, area_min, area_max } },
      ...base,
    };
  },
});
