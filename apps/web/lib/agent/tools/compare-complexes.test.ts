import { expect, test } from "vitest";
import { runTool } from "../tool";
import { compareComplexesTool } from "./compare-complexes";
import { complex, mk } from "./test-fixtures";

type Item = { complex_id: number; fit: { score: number } | null; risks: string[] };
type Data = { items: Item[]; best: Record<string, number[]>; rows: { complex_id: number }[] } | { error: string };
const items = (d: Data) => ("items" in d ? d.items : []);

test("compares two favorites in conditions", async () => {
  const { ctx } = mk({ rows: [complex(1), complex(2, 1200)] });
  const r = await compareComplexesTool.run({ complex_ids: [1, 2] }, ctx);
  const d = r.data as Data;
  expect(items(d).map((i) => i.complex_id)).toEqual([1, 2]);
  expect(items(d).every((i) => typeof i.fit?.score === "number")).toBe(true);
  expect(r.as_of["complexes:building_ledger"]).toBeDefined();
  expect(r.notices).toContain("land_share_is_average");
  expect(r.notices).not.toContain("no_redevelopment_data");
});

test("fills complex outside conditions", async () => {
  const outside = { ...complex(9), region_code: "1165010100" };
  const { ctx, calls } = mk({
    rows: [complex(1)],
    complexes: [{ id: 9, region_code: "1165010100" }],
    rowsFor: (a) => ((a.region_codes as string[]).includes("1165010100") ? [outside] : undefined),
  });
  const d = (await compareComplexesTool.run({ complex_ids: [1, 9] }, ctx)).data as Data;
  expect(calls.some((a) => (a.region_codes as string[]).includes("1165010100"))).toBe(true);
  const nine = items(d).find((i) => i.complex_id === 9)!;
  expect(nine.fit).toBeNull();
  expect(nine.risks).toContain("outside_conditions");
});

test("need_two_or_more", async () => {
  const { ctx } = mk({ rows: [complex(1)] });
  const r = await compareComplexesTool.run({ complex_ids: [1, 77] }, ctx);
  expect(r.data).toEqual({ error: "need_two_or_more" });
  expect(r.notices).toContain("complex_not_found");
});

test("dedupes ids", async () => {
  const { ctx } = mk({ rows: [complex(1), complex(2)] });
  const d = (await compareComplexesTool.run({ complex_ids: [1, 1, 2] }, ctx)).data as Data;
  expect(items(d)).toHaveLength(2);
});

test("rejects five ids", async () => {
  const { ctx } = mk();
  expect(await runTool(compareComplexesTool, '{"complex_ids":[1,2,3,4,5]}', ctx)).toHaveProperty("error");
});

test("loader error passes through", async () => {
  const { ctx } = mk({ sets: [] });
  expect((await compareComplexesTool.run({ complex_ids: [1, 2] }, ctx)).data).toEqual({ error: "region_required" });
});

test("compare adds redevelopment risk", async () => {
  const { ctx } = mk({
    rows: [complex(1), complex(2)],
    redevelopment: [{ complex_id: 1, region_code: "1168010300", name: "구역", project_type: "reconstruction", stage: "조합설립", stage_date: null }],
  });
  const d = (await compareComplexesTool.run({ complex_ids: [1, 2] }, ctx)).data as { items: (Item & { redevelopment: { status: string } })[] };
  expect(d.items[0].risks).toContain("redevelopment_in_zone");
  expect(d.items[0].redevelopment.status).toBe("in_zone");
  expect(d.items[1].risks).not.toContain("redevelopment_in_zone");
  expect(d.items[1].redevelopment).toEqual({ status: "near", dong_zone_count: 1 });
});
