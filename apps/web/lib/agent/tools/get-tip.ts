import { z } from "zod";
import { defineTool, type ToolContext } from "../tool";

// 모델이 slug를 추측하지 않도록 목록을 돌려준다. 목록은 tips 테이블에서 읽는다(코드에 slug를 두지 않는다)
async function available(ctx: ToolContext) {
  const { data, error } = await ctx.supabase.from("tips").select("slug, title").order("sort_order").limit(100);
  if (error) throw new Error(error.message);
  return data.map(({ slug, title }) => ({ slug, title }));
}

export const getTip = defineTool({
  name: "get_tip",
  description:
    "부동산 용어 TIP을 slug 또는 입력 항목(field_key)으로 조회한다. slug를 모르면 인자 없이 호출해 TIP 목록(slug·제목)을 받은 뒤 그중에서 골라 다시 호출한다. 찾지 못하면 빈 tips와 함께 목록을 돌려준다.",
  schema: z.object({ slug: z.string().max(100).optional(), field_key: z.string().max(100).optional() }),
  async run({ slug, field_key }, ctx) {
    if (!slug && !field_key) return { data: { available: await available(ctx) }, as_of: {} };
    let q = ctx.supabase.from("tips").select("slug, stage, field_key, title, body, caution, source");
    q = slug ? q.eq("slug", slug) : q.eq("field_key", field_key!);
    const { data, error } = await q.order("sort_order").limit(5);
    if (error) throw new Error(error.message);
    if (!data.length) return { data: { tips: [], available: await available(ctx) }, as_of: {} };
    return { data: { tips: data }, as_of: {} };
  },
});
