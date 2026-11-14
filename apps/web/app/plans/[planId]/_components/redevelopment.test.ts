import { expect, test } from "vitest";
import { redevelopmentText } from "./redevelopment";

test("redevelopment text per status", () => {
  expect(redevelopmentText({ status: "in_zone", dong_zone_count: 2, project: { name: "개포주공5단지", project_type: "reconstruction", stage: "관리처분인가", stage_date: "2025-09-29" } }))
    .toBe("재건축 · 관리처분인가 (2025-09-29) · 개포주공5단지");
  expect(redevelopmentText({ status: "in_zone", dong_zone_count: 1, project: { name: "a", project_type: "redevelopment", stage: "추진위", stage_date: null } }))
    .toBe("재개발 · 추진위 · a");
  expect(redevelopmentText({ status: "near", dong_zone_count: 3 })).toBe("이 단지는 매칭되지 않음 · 같은 동 정비구역 3곳");
  expect(redevelopmentText({ status: "none", dong_zone_count: 0 })).toBe("정비구역 아님(서울시 자료 기준)");
  expect(redevelopmentText({ status: "not_covered" })).toBe("서울 외 지역은 정비사업 데이터 미제공");
  expect(redevelopmentText(undefined)).toBe("정보 없음");
});

test("not_loaded text", () => {
  expect(redevelopmentText({ status: "not_loaded" })).toBe("정비사업 데이터 준비 중");
});
