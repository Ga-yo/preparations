import { expect, test } from "vitest";
import { nextTabIndex } from "./detail-tabs";

test("arrow keys wrap, Home/End jump, other keys stay", () => {
  expect(nextTabIndex(3, "ArrowRight", 4)).toBe(0);
  expect(nextTabIndex(0, "ArrowLeft", 4)).toBe(3);
  expect(nextTabIndex(2, "Home", 4)).toBe(0);
  expect(nextTabIndex(1, "End", 4)).toBe(3);
  expect(nextTabIndex(1, "a", 4)).toBe(1);
});
