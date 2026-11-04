import OpenAI from "openai";
import { z } from "zod";
import { kstToday, runAgent } from "@/lib/agent/orchestrator";
import { createClient } from "@/lib/supabase/server";

const Body = z.object({ plan_id: z.uuid(), message: z.string().min(1).max(2000) });
const HISTORY_LIMIT = 20;

export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  const { plan_id, message } = body.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { data: plan } = await supabase.from("plans").select("id, current_stage").eq("id", plan_id).maybeSingle();
  if (!plan) return Response.json({ error: "plan_not_found" }, { status: 404 });

  // 재생은 user/assistant 텍스트만: tool 행은 tool_call_id 짝이 필요해 제외한다(저장은 감사용으로 유지)
  const { data: rows, error: histErr } = await supabase
    .from("chat_messages").select("role, content").eq("plan_id", plan_id)
    .in("role", ["user", "assistant"]).order("id", { ascending: false }).limit(HISTORY_LIMIT);
  if (histErr) return Response.json({ error: "db_error" }, { status: 500 });
  const history = (rows ?? []).reverse().map((r) => ({ role: r.role as "user" | "assistant", content: r.content ?? "" }));

  const saveUser = await supabase.from("chat_messages").insert({ plan_id, role: "user", content: message });
  if (saveUser.error) return Response.json({ error: "db_error" }, { status: 500 });

  // 키가 비면 openai SDK가 OPENAI_API_KEY로 폴백해 다른 키를 DeepSeek에 보내므로 먼저 막는다
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.error("DEEPSEEK_API_KEY is not configured");
    return Response.json({ error: "llm_unavailable" }, { status: 502 });
  }
  let out;
  try {
    const client = new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" });
    out = await runAgent({
      client,
      stage: plan.current_stage,
      history: [...history, { role: "user", content: message }],
      ctx: { supabase, planId: plan_id, today: kstToday() },
    });
  } catch (e) {
    console.error("llm failed", e);
    return Response.json({ error: "llm_unavailable" }, { status: 502 });
  }

  const { error } = await supabase.from("chat_messages").insert([
    ...out.toolCalls.map((c) => ({
      plan_id, role: "tool", tool_name: c.name,
      content: JSON.stringify(c.result), tool_payload: { args: c.args } as never,
    })),
    { plan_id, role: "assistant", content: out.reply },
  ]);
  if (error) return Response.json({ error: "db_error" }, { status: 500 });
  return Response.json({ reply: out.reply });
}
