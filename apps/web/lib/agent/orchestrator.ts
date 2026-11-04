import type OpenAI from "openai";
import { SYSTEM_PROMPT } from "./prompt";
import { runTool, toOpenAiTools, type ToolContext } from "./tool";
import { toolsForStage } from "./tools";

export function modelForStage(stage: number): "deepseek-v4-flash" | "deepseek-v4-pro" {
  return stage === 3 || stage === 5 ? "deepseek-v4-pro" : "deepseek-v4-flash";
}

export const MAX_STEPS_REPLY = "답변을 마무리하지 못했습니다. 질문을 조금 나눠서 다시 질문해 주세요.";

export async function runAgent(p: {
  client: Pick<OpenAI, "chat">;
  stage: number;
  history: OpenAI.ChatCompletionMessageParam[];
  ctx: ToolContext;
  maxSteps?: number;
}): Promise<{ reply: string; toolCalls: { name: string; args: unknown; result: unknown }[] }> {
  const tools = toolsForStage(p.stage);
  const openAiTools = toOpenAiTools(tools);
  const messages: OpenAI.ChatCompletionMessageParam[] = [{ role: "system", content: SYSTEM_PROMPT }, ...p.history];
  const toolCalls: { name: string; args: unknown; result: unknown }[] = [];

  for (let step = 0; step < (p.maxSteps ?? 5); step++) {
    const res = await p.client.chat.completions.create({
      model: modelForStage(p.stage),
      messages,
      tools: openAiTools,
    });
    const msg = res.choices[0].message;
    if (!msg.tool_calls?.length) return { reply: msg.content ?? "", toolCalls };

    messages.push(msg);
    for (const call of msg.tool_calls) {
      if (call.type !== "function") continue;
      const tool = tools.find((t) => t.name === call.function.name);
      let result: unknown;
      if (!tool) result = { error: "unknown_tool" };
      else {
        try {
          result = await runTool(tool, call.function.arguments, p.ctx);
        } catch (e) {
          console.error(`tool ${tool.name} failed`, e); // 스택은 서버 로그에만
          result = { error: "tool_failed" };
        }
      }
      toolCalls.push({ name: call.function.name, args: call.function.arguments, result });
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return { reply: MAX_STEPS_REPLY, toolCalls };
}
