import { expect, test } from "vitest";
import { busColor, lineColor, lineLabel } from "./lines";

test("lineColor: 접두어와 무관하게 같은 노선 색, 신분당은 분당과 구분", () => {
  expect(lineColor("수도권 2호선")).toBe("#00A84D");
  expect(lineColor("2호선")).toBe("#00A84D");
  expect(lineColor("서울 9호선")).toBe("#BDB092");
  expect(lineColor("신분당선")).toBe("#D4003B");
  expect(lineColor("수인분당선")).toBe("#F5A200");
  expect(lineColor("모르는선")).toBe("#6B7280");
});
test("lineLabel: 수도권 접두어를 뺀다", () => expect(lineLabel("수도권 2호선")).toBe("2호선"));
test("busColor: 간선 파랑, 지선 초록, 모르는 유형 회색", () => {
  expect(busColor(11)).toBe("#3D5BAB");
  expect(busColor(12)).toBe("#5BB025");
  expect(busColor(null)).toBe("#6B7280");
});
