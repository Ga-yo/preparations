// 단계 페이지를 열 때 사용자 입력 상태를 보고 보여 줄 TIP을 고른다. 툴 없이 한 번만 부른다
import type OpenAI from "openai";
import { z } from "zod";
import { LLM_MODEL } from "./orchestrator";

export type TipPick = { slug: string; note: string };

// 금액은 보내지 않고 입력했는지만 보낸다(원칙 9). 선호 이유는 LLM에 보내지 않는다(2단계 정의)
const MONEY = new Set(["cash_assets", "annual_income", "existing_debt", "existing_debt_annual_payment", "extra_funds", "price_max", "price_min", "mgmt_fee_per_m2_max"]);
const DROP = new Set(["id", "plan_id", "user_id", "created_at", "updated_at", "region_reason", "commute_region_code", "commute_station"]);

export function tipSituation(rows: (Record<string, unknown> | null)[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const row of rows) for (const [k, v] of Object.entries(row ?? {})) {
    if (DROP.has(k) || v == null || (Array.isArray(v) && !v.length)) continue;
    if (MONEY.has(k)) out[k] = (v as number) > 0 ? "입력함" : "없음";
    else if (k === "region_codes") out.region_count = (v as unknown[]).length;
    else out[k] = v;
  }
  if (rows.some((r) => r?.commute_region_code || r?.commute_station)) out.commute = "입력함";
  return out;
}

const PROMPT = `당신은 부동산 초보에게 TIP을 골라 주는 도우미입니다. 사용자의 입력 상태를 보고, TIP 목록에서 지금 이 사용자에게 꼭 필요한 것만 1~3개 고르세요. 고르지 않은 TIP은 화면에서 숨겨집니다.
- 이미 잘 알거나 해당 없는 TIP은 고르지 마세요(예: 재건축 관심이 없으면 재건축 TIP 제외, 보유 주택이 없으면 중과 관련 제외).
- note는 왜 이 사용자에게 필요한지 '~해요' 말투 한 문장(50자 안팎)입니다. 숫자·금액은 쓰지 마세요.
- 아래 JSON 하나만, 코드 블록 없이 답하세요.
{"tips": [{"slug": "목록의 slug", "note": "한 문장"}]}`;

const Reply = z.object({ tips: z.array(z.object({ slug: z.string().max(100), note: z.string().trim().min(1).max(150) })).max(3) });

export function parseTipPicks(text: string, allowed: Set<string>): TipPick[] {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e <= s) return [];
  try {
    const r = Reply.safeParse(JSON.parse(text.slice(s, e + 1)));
    if (!r.success) return [];
    // 목록에 없는 slug(지어낸 것)와 중복은 버린다
    return [...new Map(r.data.tips.filter((t) => allowed.has(t.slug)).map((t) => [t.slug, t])).values()];
  } catch { return []; }
}

export async function pickTips(p: {
  client: Pick<OpenAI, "chat">; stage: number; options: { slug: string; title: string }[]; situation: Record<string, unknown>;
}): Promise<TipPick[]> {
  const res = await p.client.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      { role: "system", content: PROMPT },
      { role: "user", content: `${p.stage}단계\n입력 상태: ${JSON.stringify(p.situation)}\nTIP 목록(slug: 제목):\n${p.options.map((o) => `- ${o.slug}: ${o.title}`).join("\n")}` },
    ],
  });
  return parseTipPicks(res.choices[0]?.message?.content ?? "", new Set(p.options.map((o) => o.slug)));
}
