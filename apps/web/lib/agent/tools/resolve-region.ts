import { z } from "zod";
import { defineTool } from "../tool";
import { resolveRegion } from "../region";

export const resolveRegionTool = defineTool({
  name: "resolve_region",
  description: "지역명(예: '서울특별시 강남구', '강남구')을 법정동코드로 변환한다. 모호하면 후보 목록을 돌려주니 사용자에게 되묻는다.",
  schema: z.object({ name: z.string().min(1).max(50).describe("사용자가 말한 지역명") }),
  async run({ name }, ctx) {
    const r = await resolveRegion(ctx.supabase, name);
    const { data } = await ctx.supabase.from("data_freshness").select("as_of").eq("dataset", "regions").maybeSingle();
    return { data: r, as_of: data ? { regions: data.as_of } : ({} as Record<string, string>) };
  },
});
