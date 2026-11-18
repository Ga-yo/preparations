import { expect, test, vi } from "vitest";
import type { ReportPayload } from "./assemble";
import { hasNumberClaim, writeNarrative } from "./narrative";

const payload = {
  version: 1, generated_on: "2026-11-18",
  budget: { data: { max_price: 500000000 }, as_of: { loan_rules: "2025-07-01" } },
  conditions: { region_names: ["서울특별시 강남구"], region_reason: "부모님 댁 근처", commute_region_name: null, area_min: 59, area_max: 85, price_max: null, redevelopment_interest: false },
  favorites: [{ complex_id: 1, name: "래미안 2차" }], compare: null,
  checklist: [{ field_key: "checklist", title: "등기부 확인", body: "긴 본문", caution: null }],
  as_of: { loan_rules: "2025-07-01" }, notices: [],
} as unknown as ReportPayload;

const fakeClient = (reply: string) => {
  const create = vi.fn(async () => ({ choices: [{ message: { content: reply } }] }));
  return { client: { chat: { completions: { create } } } as never, create };
};

test("선호 이유(region_reason)와 TIP 본문은 LLM에 보내지 않는다", async () => {
  const { client, create } = fakeClient("예산 안에서 관심 단지를 비교해 보세요.");
  expect(await writeNarrative(client, payload)).toBe("예산 안에서 관심 단지를 비교해 보세요.");
  const sent = JSON.stringify((create.mock.calls[0] as unknown[])[0]);
  expect(sent).not.toContain("부모님 댁 근처");
  expect(sent).not.toContain("긴 본문");
  expect(sent).toContain("래미안 2차");
});

test("금액·비율을 쓴 응답은 버린다(원칙 1)", async () => {
  const { client } = fakeClient("예산은 5억 원입니다.");
  await expect(writeNarrative(client, payload)).rejects.toThrow("narrative_has_numbers");
});

test("hasNumberClaim", () => {
  for (const s of ["5억", "3,000만 원", "4.2%", "120 만원", "70퍼센트"]) expect(hasNumberClaim(s), s).toBe(true);
  for (const s of ["래미안 2차", "기준일 2025-07-01", "1단계 예산", "억지로"]) expect(hasNumberClaim(s), s).toBe(false);
});
