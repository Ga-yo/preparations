import { expect, test } from "vitest";
import { ruleQuestions } from "./suggestions";

const none = { profile: null, cond: null, favoriteCount: 0 };

test("입력이 없어도 단계마다 기본 질문 3개", () => {
  for (const s of [1, 2, 3, 4, 5]) expect(ruleQuestions(s, none)).toHaveLength(3);
});

test("1단계: 입력값에 맞는 질문이 먼저 나온다", () => {
  const q = ruleQuestions(1, { ...none, profile: { is_first_time: true, existing_debt: 1, timeline: "2_3y" } });
  expect(q).toEqual([
    "생애최초면 취득세 감면을 받을 수 있나요?",
    "기존 대출이 대출 한도를 얼마나 줄이나요?",
    "구매 시기가 늦어지면 대출 규제가 달라질 수 있나요?",
  ]);
});

test("1단계: 실거주면 투자 질문 없음, 투자면 있음", () => {
  expect(ruleQuestions(1, { ...none, profile: { purpose: "live" } }).join()).not.toContain("투자");
  expect(ruleQuestions(1, { ...none, profile: { purpose: "invest" } })[0]).toContain("투자");
});

test("3단계: 필수 조건 3개 이상이면 후보 감소 질문", () => {
  const q = ruleQuestions(3, { ...none, cond: { price_max: 1, priorities: { a: "must", b: "must", c: "must" } } });
  expect(q[0]).toBe("필수 조건이 많으면 후보가 줄지 않나요?");
});

test("2단계: 지역이 있으면 지역 추천 질문 없음", () => {
  expect(ruleQuestions(2, { ...none, cond: { region_codes: ["1168000000"] } })[0]).toBe("희망 지역의 시세는 어느 정도인가요?");
});
