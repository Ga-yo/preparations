import { expect, test } from "vitest";
import { fakeDb } from "./fake-db";
import { loadRedevelopment } from "./redevelopment";

const P = (o: Record<string, unknown>) => ({
  id: 1, name: "구역", project_type: "reconstruction", stage: "조합설립", stage_date: "2025-03-31",
  region_code: "1168011800", complex_id: null, ...o,
});
const db = (projects: Record<string, unknown>[]) => fakeDb({
  redevelopment_projects: projects,
  data_freshness: [{ dataset: "redevelopment:seoul", as_of: "2026-06-30", source: "t" }],
});

test("in_zone by complex_id", async () => {
  const r = await loadRedevelopment(db([P({ complex_id: 7, name: "도곡우성" }), P({ id: 2 })]), [{ id: 7, region_code: "1168011800" }]);
  expect(r.byId[7]).toEqual({
    status: "in_zone", dong_zone_count: 2,
    project: { name: "도곡우성", project_type: "reconstruction", stage: "조합설립", stage_date: "2025-03-31" },
  });
  expect(r.as_of).toEqual({ "redevelopment:seoul": "2026-06-30" });
});

test("in_zone picks most advanced stage", async () => {
  const r = await loadRedevelopment(db([P({ complex_id: 7, stage: "추진위" }), P({ id: 2, complex_id: 7, stage: "관리처분인가", name: "b" })]),
    [{ id: 7, region_code: "1168011800" }]);
  expect(r.byId[7]).toMatchObject({ status: "in_zone", project: { stage: "관리처분인가" } });
});

test("near when only dong match", async () => {
  const r = await loadRedevelopment(db([P({ complex_id: 99 })]), [{ id: 7, region_code: "1168011800" }]);
  expect(r.byId[7]).toEqual({ status: "near", dong_zone_count: 1 });
});

test("none in covered sido", async () => {
  const r = await loadRedevelopment(db([]), [{ id: 7, region_code: "1168011800" }]);
  expect(r.byId[7]).toEqual({ status: "none", dong_zone_count: 0 });
});

test("not_covered outside seoul", async () => {
  const r = await loadRedevelopment(db([P({ region_code: "4113510300" })]), [{ id: 8, region_code: "4113510300" }]);
  expect(r.byId[8]).toEqual({ status: "not_covered" });
});

test("empty input makes no as_of", async () => {
  expect(await loadRedevelopment(db([]), [])).toEqual({ byId: {}, as_of: {} });
});
