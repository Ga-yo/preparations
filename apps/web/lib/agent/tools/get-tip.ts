import { z } from "zod";
import { defineTool } from "../tool";

export const getTip = defineTool({
  name: "get_tip",
  description: "부동산 용어 TIP을 slug 또는 입력 항목(field_key)으로 조회한다. 둘 중 하나는 필요하다.",
  schema: z.object({ slug: z.string().max(100).optional(), field_key: z.string().max(100).optional() }),
  async run({ slug, field_key }, ctx) {
    if (!slug && !field_key) return { data: { error: "slug_or_field_key_required" }, as_of: {} };
    let q = ctx.supabase.from("tips").select("slug, stage, field_key, title, body, caution, source");
    q = slug ? q.eq("slug", slug) : q.eq("field_key", field_key!);
    const { data, error } = await q.order("sort_order").limit(5);
    if (error) throw new Error(error.message);
    return { data: { tips: data }, as_of: {} };
  },
});
