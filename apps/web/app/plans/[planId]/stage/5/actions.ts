import { z } from "zod";
import { kstToday } from "@/lib/agent/orchestrator";
import type { ToolResult } from "@/lib/agent/tool";
import { compareComplexesTool } from "@/lib/agent/tools/compare-complexes";
import { compareConditionChanges } from "@/lib/agent/tools/compare-condition-changes";

const MAX_COMPARE = 4;

async function client() {
  const { createClient } = await import("@/lib/supabase/server"); // server-only: 테스트가 import할 수 있게 지연 로드
  return createClient();
}
const ctxOf = async (planId: string) => ({ supabase: await client(), planId, today: kstToday() });

// URL ids(쉼표 목록 또는 반복 파라미터)에서 관심 단지만 골라 최대 4개. 없으면 관심 단지 앞 4개 (M5-D2)
export function parseIds(raw: string | string[] | undefined, favorites: number[]): number[] {
  const parts = (Array.isArray(raw) ? raw : [raw ?? ""]).flatMap((s) => s.split(",")).filter((s) => s.trim() !== "");
  if (!parts.length) return favorites.slice(0, MAX_COMPARE);
  const ids = parts.map(Number).filter((n) => Number.isInteger(n) && n > 0 && favorites.includes(n));
  return [...new Set(ids)].slice(0, MAX_COMPARE);
}

export async function compareForPlan(planId: string, ids: number[]): Promise<ToolResult> {
  return compareComplexesTool.run({ complex_ids: ids }, await ctxOf(planId));
}

export async function changesForPlan(planId: string): Promise<ToolResult> {
  return compareConditionChanges.run({}, await ctxOf(planId));
}

// 5단계 진입 버튼에서만 부른다(GET 렌더에서 쓰지 않음, M5-D8). 채팅 모델 선택이 current_stage를 따른다
export async function enterStage5(planId: string): Promise<void> {
  z.uuid().parse(planId);
  const { error } = await (await client()).from("plans").update({ current_stage: 5 }).eq("id", planId).lt("current_stage", 5);
  if (error) throw new Error(error.message);
}
