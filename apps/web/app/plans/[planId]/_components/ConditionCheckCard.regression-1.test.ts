// Regression: ISSUE-002 — 선호 조건별 충족 수가 "· 그중"으로 이어져 깔때기(누적)처럼 읽히던 문제
// Found by /qa on 2026-11-19
// Report: .gstack/qa-reports/run-20261119T034141Z/qa-report-localhost-2026-11-19.md
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { ConditionCheckCard } from "./ConditionCheckCard";

const render = (prefer: Record<string, number>, total = 616) =>
  renderToStaticMarkup(createElement(ConditionCheckCard, {
    result: {
      data: { conflicts: [], notices: [], counts: { total, must: 616, prefer } },
      as_of: {},
    },
  }));

test("선호 조건별 충족 수는 필수 충족 단지 기준으로 각각 센 값임을 밝히고 '그중'으로 잇지 않는다", () => {
  const html = render({ price_max: 191, area: 473 });
  expect(html).not.toContain("그중");
  expect(html).toContain("필수 조건 충족 616개 중 선호 조건별 충족(각각 따로 셈): 희망 최고가 191개 · 희망 면적 473개");
});

test("선호 조건이 없으면 선호 조건별 문장을 쓰지 않는다", () => {
  expect(render({})).not.toContain("선호 조건별");
});

test("희망 지역 단지와 필수 충족 수가 같으면 한 칸으로 합친다", () => {
  const same = render({});
  expect(same).toContain("희망 지역 단지 · 모두 필수 조건 충족");
  expect(same.match(/616곳/g)).toHaveLength(1);
  const diff = render({}, 900);
  expect(diff).toContain("900곳");
  expect(diff).toContain("616곳");
});
