import type OpenAI from "openai";
import { expect, test } from "vitest";
import { pickTips as showPicked } from "@/app/plans/[planId]/_components/TipPanel";
import { parseTipPicks, pickTips, tipSituation } from "./tip-picks";

test("tipSituation: 금액·선호 이유·식별값은 보내지 않는다", () => {
  const s = tipSituation([
    { plan_id: "p", annual_income: 60_000_000, existing_debt: 0, is_first_time: true, purpose: "live", updated_at: "t" },
    { region_codes: ["11680", "11650"], region_reason: "부모님 근처", commute_station: "강남역", redevelopment_interest: null, housing_types: [] },
  ]);
  expect(s).toEqual({ annual_income: "입력함", existing_debt: "없음", is_first_time: true, purpose: "live", region_count: 2, commute: "입력함" });
  expect(JSON.stringify(s)).not.toMatch(/60000000|부모님|강남/);
});

test("parseTipPicks: 코드 블록을 견디고, 목록에 없는 slug·중복·잘못된 JSON은 버린다", () => {
  const allowed = new Set(["ltv-dsr", "purchase-costs"]);
  expect(parseTipPicks('```json\n{"tips":[{"slug":"ltv-dsr","note":"a"},{"slug":"made-up","note":"b"},{"slug":"ltv-dsr","note":"c"}]}\n```', allowed))
    .toEqual([{ slug: "ltv-dsr", note: "c" }]);
  expect(parseTipPicks("모르겠어요", allowed)).toEqual([]);
  expect(parseTipPicks('{"tips":"x"}', allowed)).toEqual([]);
});

test("pickTips: 입력 상태와 TIP 목록을 한 번에 보낸다", async () => {
  const calls: { messages: { content: string }[] }[] = [];
  const client = { chat: { completions: { create: async (req: never) => {
    calls.push(req);
    return { choices: [{ message: { content: '{"tips":[{"slug":"ltv-dsr","note":"생애최초라 한도가 달라져요."}]}' } }] };
  } } } } as unknown as Pick<OpenAI, "chat">;
  const r = await pickTips({ client, stage: 1, options: [{ slug: "ltv-dsr", title: "LTV·DSR" }], situation: { is_first_time: true } });
  expect(r).toEqual([{ slug: "ltv-dsr", note: "생애최초라 한도가 달라져요." }]);
  expect(calls[0].messages[1].content).toContain("- ltv-dsr: LTV·DSR");
  expect(calls[0].messages[1].content).toContain('"is_first_time":true');
});

test("화면: AI가 고른 TIP만 남기고, 고른 결과가 없으면 모두 보여 준다", () => {
  const tip = (slug: string) => ({ slug, field_key: "k", title: slug, body: "b", caution: null });
  expect(showPicked([tip("a"), tip("b")], [{ slug: "b", note: "n" }])).toEqual([{ ...tip("b"), note: "n" }]);
  expect(showPicked([tip("a"), tip("b")], null)).toHaveLength(2);
});
