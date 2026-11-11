import { expect, test } from "vitest";
import { runTool } from "../tool";
import { searchComplexes } from "./search-complexes";
import { complex, mk, saved } from "./test-fixtures";

type Data = { candidates: { complex_id: number; fit: { score: number } }[]; total: number; blocking?: string[]; criteria: { months: number } };

test("returns ranked candidates with as_of", async () => {
  const { ctx } = mk({ rows: [complex(1), complex(2, 300), complex(3, 2500)] });
  const r = await searchComplexes.run({ limit: 20 }, ctx);
  const d = r.data as Data;
  expect(d.candidates.map((c) => c.complex_id).sort()).toEqual([1, 3]);
  expect(d.total).toBe(2);
  const s = d.candidates.map((c) => c.fit.score);
  expect(s).toEqual([...s].sort((a, b) => b - a));
  expect(r.as_of["complexes:building_ledger"]).toBeDefined();
});

test("search_complexes returns blocking when no candidates", async () => {
  const { ctx } = mk({ rows: [complex(1, 300)] });
  const d = (await searchComplexes.run({ limit: 20 }, ctx)).data as Data;
  expect(d.candidates).toEqual([]);
  expect(d.blocking).toEqual(["household_count_min"]);
});

test("includes no_location_data notice", async () => {
  const { ctx } = mk();
  expect((await searchComplexes.run({ limit: 20 }, ctx)).notices).toContain("no_location_data");
});

test("rejects limit 0", async () => {
  const { ctx } = mk();
  expect(await runTool(searchComplexes, '{"limit":0}', ctx)).toHaveProperty("error");
});

test("지역 미저장 → region_required", async () => {
  const { ctx } = mk({ sets: [saved({ region_codes: [] })] });
  expect((await searchComplexes.run({ limit: 20 }, ctx)).data).toEqual({ error: "region_required" });
});
