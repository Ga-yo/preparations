import { ChatPanel } from "./ChatPanel";
import { loadAssistant, runAiCheck } from "./assistant";

// 단계별 AI 점검 + 추천 질문 + 채팅(M7). 데이터는 서버에서 읽고, 점검은 버튼으로만 실행(M7-D1)
export async function AssistantPanel({ planId, stage }: { planId: string; stage: number }) {
  const initial = await loadAssistant(planId, stage);
  async function check() {
    "use server";
    return runAiCheck(planId, stage);
  }
  return <ChatPanel planId={planId} stage={stage} initial={initial} runCheck={check} />;
}
