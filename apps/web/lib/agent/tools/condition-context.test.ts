import { expect, test } from "vitest";
import { loadConditionContext } from "./condition-context";
import { mk, saved } from "./test-fixtures";

test("area only is a condition", async () => {
  const { ctx } = mk({ sets: [saved({ housing_types: [], price_max: null, household_count_min: null, priorities: {} })] });
  const r = await loadConditionContext(ctx);
  expect(r).not.toHaveProperty("error");
  expect(r).toMatchObject({ rows: expect.any(Array), truncated: false });
});

test("returns latest condition set id", async () => {
  const { ctx } = mk({ sets: [saved({ id: "old", created_at: "2026-11-01" }), saved({ id: "new", created_at: "2026-11-05" })] });
  expect(await loadConditionContext(ctx)).toMatchObject({ conditionSetId: "new", regionCodes: ["1168000000"] });
});

test("region_required", async () => {
  const { ctx } = mk({ sets: [saved({ region_codes: [] })] });
  expect(await loadConditionContext(ctx)).toEqual({ error: "region_required" });
});

test("offset 1 reads previous set", async () => {
  const { ctx } = mk({ sets: [saved({ id: "old", created_at: "2026-11-01" }), saved({ id: "new", created_at: "2026-11-05" })] });
  expect(await loadConditionContext(ctx, 1)).toMatchObject({ conditionSetId: "old" });
});
