// Regression: ISSUE-002 — 선호 조건별 충족 수가 "· 그중"으로 이어져 깔때기(누적)처럼 읽히던 문제
// Found by /qa on 2026-11-19
// Report: .gstack/qa-reports/run-20261119T034141Z/qa-report-localhost-2026-11-19.md
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { ConditionCheckCard } from "./ConditionCheckCard";

const render = (prefer: Record<string, number>) =>
  renderToStaticMarkup(createElement(ConditionCheckCard, {
    tips: [],
    result: {
      data: { conflicts: [], notices: [], matches: [], counts: { total: 616, must: 616, prefer }, criteria: { months: 12 } },
      as_of: {},
    },
  }));

test("선호 조건별 충족 수는 필수 충족 단지 기준으로 각각 센 값임을 밝히고 '그중'으로 잇지 않는다", () => {
  const html = render({ price_max: 191, area: 473 });
  expect(html).not.toContain("그중");
  expect(html).toContain("필수 조건 충족 616개 중 선호 조건별 충족(각각 따로 셈): 희망 최고가 191개 · 희망 면적 473개");
});

test("선호 조건이 없으면 필수 충족 수까지만 쓴다", () => {
  const html = render({});
  expect(html).toContain("필수 조건 충족 616개");
  expect(html).not.toContain("선호 조건별");
});
