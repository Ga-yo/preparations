import { describe, expect, it } from "vitest";
import { budgetBadge, unmetKeys } from "./fit-chips";

describe("budgetBadge", () => {
  it("labels the three budget states", () => {
    expect(budgetBadge(true).text).toBe("예산 안");
    expect(budgetBadge(false).text).toBe("예산 밖");
    expect(budgetBadge(null).text).toBe("예산 판단 불가");
  });
});

describe("unmetKeys", () => {
  it("drops keys that are missing data", () => {
    expect(unmetKeys({ score: 50, met: [], unmet: ["price_max", "approval_year_min"], missing: ["approval_year_min"], within_budget: null })).toEqual(["price_max"]);
  });
});
