import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@repo/db-types";
import type OpenAI from "openai";
import { z } from "zod";

export type ToolContext = { supabase: SupabaseClient<Database>; planId: string; today: string };
export type ToolResult = {
  data: unknown;
  as_of: Record<string, string>;
  stale?: string[];
  notices?: string[];
};
// args는 z.input: 기본값이 있는 인자는 생략 가능(runTool은 파싱된 값을 넘긴다)
export type Tool<S extends z.ZodObject = z.ZodObject> = {
  name: string;
  description: string;
  schema: S;
  run(args: z.input<S>, ctx: ToolContext): Promise<ToolResult>;
};
// 1단 스키마: optional/default/nullable을 벗긴 뒤 object이거나 원시값이 아닌 배열 원소면 거부
function assertFlat(tool: string, key: string, field: z.core.$ZodType): void {
  const def = field._zod.def as { type: string; innerType?: z.core.$ZodType; element?: z.core.$ZodType };
  if (def.innerType) return assertFlat(tool, key, def.innerType);
  if (def.type === "object") throw new Error(`${tool}.${key}: 중첩 object 인자는 허용하지 않는다`);
  if (def.type === "array") {
    const el = (def.element?._zod.def as { type: string }).type;
    if (el === "object" || el === "array") throw new Error(`${tool}.${key}: 배열 원소는 원시값이어야 한다`);
  }
}

export function defineTool<S extends z.ZodObject>(t: Tool<S>): Tool<S> {
  for (const [k, f] of Object.entries(t.schema.shape)) assertFlat(t.name, k, f as z.core.$ZodType);
  return t;
}

export function toOpenAiTools(tools: Tool[]): OpenAI.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: z.toJSONSchema(t.schema, { io: "input" }) as Record<string, unknown>,
    },
  }));
}

export async function runTool(tool: Tool, rawArgs: string, ctx: ToolContext): Promise<ToolResult | { error: string }> {
  let json: unknown;
  try {
    json = JSON.parse(rawArgs.trim() || "{}");
  } catch {
    return { error: "인자가 올바른 JSON이 아닙니다." };
  }
  const parsed = tool.schema.safeParse(json);
  if (!parsed.success) return { error: `인자 오류: ${z.prettifyError(parsed.error)}` };
  return tool.run(parsed.data, ctx);
}
