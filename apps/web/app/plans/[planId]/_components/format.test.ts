import { expect, test } from "vitest";
import { formatWon } from "./format";

test.each([
  [0, "0원"], [9_999, "9,999원"], [10_000, "1만원"], [100_000_000, "1억원"],
  [526_000_000, "5억 2,600만원"], [199_995_000, "2억원"], [404_150_000, "4억 415만원"],
])("formatWon(%i) = %s", (n, s) => expect(formatWon(n)).toBe(s));
