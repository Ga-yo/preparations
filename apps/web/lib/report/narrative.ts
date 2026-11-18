// M6b 리포트 AI 해설. 숫자는 위 표(결정론 스냅숏)가 기준이고, 해설은 그 뜻을 말로만 풀어 준다(원칙 1).
import type OpenAI from "openai";
import { LLM_MODEL } from "@/lib/agent/orchestrator";
import type { ReportPayload } from "./assemble";

const NARRATIVE_PROMPT = `당신은 내 집 마련 구매 검토 리포트의 해설을 쓰는 한국어 도우미입니다. 사용자는 부동산을 잘 모릅니다.
입력 JSON은 코드가 계산한 리포트 스냅숏입니다. 화면에는 이 숫자가 이미 표로 나와 있습니다.

규칙:
- 금액·비율·금리·면적 같은 숫자를 쓰지 마세요. "위 예산 카드", "비교 표의 가격 행"처럼 표를 가리키세요.
- 입력에 없는 사실을 지어내지 마세요. 시세 전망·투자 권유·확정적 표현(오른다, 반드시)을 쓰지 마세요.
- 어느 단지를 사라고 정해 주지 말고, 매수를 권하거나 말리지 마세요.
- budget.data.diagnoses, compare의 risks·best·fit, notices의 코드를 쉬운 말로 풀어 쓰세요. notices에 dummy_data가 있으면 은행 금리가 테스트용 더미라고 알리세요.
- 순서: 예산 진단 → 관심 단지 비교에서 볼 점 → 계약 전에 확인할 점. 3~5문단, 마크다운 없이 평문으로 쓰세요.`;

// 원칙 1 안전장치: 금액·비율 표현이 있으면 해설을 버린다. 단지명 "2차", 날짜 등 단순 숫자는 허용
const NUMBER_CLAIM = /\d[\d,.]*\s*(억|천만|백만|만\s*원|만원|원|%|퍼센트|㎡|평)/;
export const hasNumberClaim = (s: string) => NUMBER_CLAIM.test(s);

export async function writeNarrative(client: Pick<OpenAI, "chat">, p: ReportPayload): Promise<string> {
  // 선호 이유는 자유 입력이라 식별 정보가 섞일 수 있어 보내지 않는다(원칙 9). TIP 본문은 화면에 이미 있어 제목만
  const input = {
    ...p,
    conditions: p.conditions && { ...p.conditions, region_reason: undefined },
    checklist: p.checklist.map((t) => t.title),
  };
  const res = await client.chat.completions.create({
    model: LLM_MODEL,
    messages: [{ role: "system", content: NARRATIVE_PROMPT }, { role: "user", content: JSON.stringify(input) }],
  });
  const text = res.choices[0]?.message.content?.trim() ?? "";
  if (!text) throw new Error("narrative_empty");
  if (hasNumberClaim(text)) throw new Error("narrative_has_numbers");
  return text;
}
