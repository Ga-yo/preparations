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

test("stage 2 life prefs become weights ties and parking default", async () => {
  const { ctx } = mk({ sets: [saved({ uses_transit: true, school_importance: 5, environment_prefs: ["near_park", "quiet"], parking_required: true })] });
  const r = await loadConditionContext(ctx);
  if ("error" in r) throw new Error(r.error);
  expect(r.conditions.weights).toEqual({ station_distance_max: 2, elementary_distance_max: 2 });
  // 선호 주거환경은 2단계에서 뺐다: 예전에 저장돼 복사된 값이 남아 있어도 정렬·안내에 쓰지 않는다
  expect(r.conditions.ties?.map((t) => t.field)).toEqual(["nearest_station_m", "nearest_elementary_m"]);
  expect(r.conditions.parking_per_household_min).toBe(1);
  expect(r.notices ?? []).not.toEqual(expect.arrayContaining(["quiet_no_data"]));
  expect(r.notices ?? []).not.toEqual(expect.arrayContaining(["no_park_data"]));
});

test("commute code reaches rpc with straight-line notice", async () => {
  const { ctx, calls } = mk({ sets: [saved({ commute_region_code: "1114000000" })] });
  const r = await loadConditionContext(ctx);
  expect(calls[0].commute_code).toBe("1114000000");
  expect(r).toMatchObject({ commute: { commute_code: "1114000000" }, notices: expect.arrayContaining(["commute_is_straight_line"]) });
});

test("출퇴근 역은 역 이름으로 rpc에 전달된다", async () => {
  const { ctx, calls } = mk({ sets: [saved({ commute_station: "강남" })] });
  const r = await loadConditionContext(ctx);
  expect(calls[0]).toMatchObject({ commute_station: "강남" });
  expect(calls[0]).not.toHaveProperty("commute_code");
  expect(r).toMatchObject({ commute: { commute_station: "강남" }, notices: expect.arrayContaining(["commute_is_straight_line"]) });
});

test("no commute code sends none", async () => {
  const { ctx, calls } = mk();
  const r = await loadConditionContext(ctx);
  expect(calls[0]).not.toHaveProperty("commute_code");
  expect((r as { notices?: string[] }).notices ?? []).not.toContain("commute_is_straight_line");
});
