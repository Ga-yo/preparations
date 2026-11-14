import { expect, test } from "vitest";
import { compareConditionChanges } from "./compare-condition-changes";
import { complex, mk, saved } from "./test-fixtures";

test("no_previous_conditions", async () => {
  const { ctx } = mk();
  expect((await compareConditionChanges.run({}, ctx)).data).toEqual({ error: "no_previous_conditions" });
});

test("returns changes for two sets", async () => {
  const { ctx } = mk({
    rows: [complex(1), complex(2, 300)],
    sets: [saved({ id: "old", created_at: "2026-11-01" }), saved({ id: "new", created_at: "2026-11-05", price_max: 700_000_000, priorities: {} })],
  });
  const r = await compareConditionChanges.run({}, ctx);
  const d = r.data as { changed: string[]; ranking: { count_before: number; count_after: number } };
  expect(d.changed).toContain("price_max");
  expect(d.changed).toContain("priorities.household_count_min");
  expect(d.ranking.count_before).toBe(1); // 세대수 must로 단지2 제외
  expect(d.ranking.count_after).toBe(2);
  expect(r.as_of["complexes:building_ledger"]).toBeDefined();
});

test("latest error passes through", async () => {
  const { ctx } = mk({ sets: [saved({ region_codes: [] })] });
  expect((await compareConditionChanges.run({}, ctx)).data).toEqual({ error: "region_required" });
});
