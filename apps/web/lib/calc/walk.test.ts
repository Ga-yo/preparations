import { describe, expect, test } from "vitest";
import { WALK_DETOUR, WALK_M_PER_MIN, WALK_SOURCE, walkMinutes } from "./walk";

describe("walkMinutes", () => {
  test("확정한 계수로 올림", () => {
    expect(walkMinutes(400)).toBe(Math.ceil((400 * WALK_DETOUR) / WALK_M_PER_MIN));
  });
  test("계수 1.3, 77.4m/분이면 400m는 7분", () => expect(walkMinutes(400)).toBe(7));
  test("0m도 최소 1분", () => expect(walkMinutes(0)).toBe(1));
  test("거리가 늘면 분도 줄지 않는다", () =>
    expect(walkMinutes(1000)).toBeGreaterThanOrEqual(walkMinutes(999)));
  test("WALK_SOURCE가 비어 있지 않다", () => expect(WALK_SOURCE.length).toBeGreaterThan(5));
});
