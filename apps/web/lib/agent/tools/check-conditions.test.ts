import { expect, test } from "vitest";
import { checkConditions } from "./check-conditions";
import { complex, mk, saved } from "./test-fixtures";

type Data = { conflicts: { code: string }[]; notices: string[]; counts: { total: number; must: number }; matches: { complex_id: number }[] };

test("저장된 지역·면적으로 RPC 호출, must 필터 결과와 as_of", async () => {
  const { ctx, calls } = mk();
  const r = await checkConditions.run({}, ctx);
  expect(calls).toEqual([{ region_codes: ["1168000000"], area_min: 80, area_max: 90, months: 12 }]);
  const d = r.data as Data;
  expect(d.counts).toMatchObject({ total: 2, must: 1 });
  expect(d.matches.map((m) => m.complex_id)).toEqual([1]);
  expect(r.as_of).toMatchObject({ "complexes:building_ledger": "2026-11-02", "transactions:apartment": "2026-11-07" });
});

test("지역별 예산은 get_region_prices 결과에서 온다(예산 초과 충돌)", async () => {
  const { ctx } = mk({ sets: [saved({ price_max: 9_000_000_000 })] });
  const d = (await checkConditions.run({}, ctx)).data as Data;
  expect(d.conflicts.map((c) => c.code)).toContain("price_max_over_budget");
});

test("3,001행이면 truncated, 3,000행만 분석", async () => {
  const rows = Array.from({ length: 3001 }, (_, i) => complex(i + 1));
  const { ctx } = mk({ rows });
  const d = (await checkConditions.run({}, ctx)).data as Data;
  expect(d.notices).toContain("truncated");
  expect(d.counts.total).toBe(3000);
});

test("단지 대장 freshness가 없으면 as_of에서 키를 뺀다", async () => {
  const { ctx } = mk({ ledgerAsOf: null });
  const r = await checkConditions.run({}, ctx);
  expect(Object.keys(r.as_of)).not.toContain("complexes:building_ledger");
});

test("지역 미저장 → region_required", async () => {
  const { ctx, calls } = mk({ sets: [saved({ region_codes: [] })] });
  expect((await checkConditions.run({}, ctx)).data).toEqual({ error: "region_required" });
  expect(calls).toEqual([]);
});

test("3단계 미저장 → conditions_required", async () => {
  const { ctx } = mk({ sets: [saved({ price_max: null, household_count_min: null, housing_types: [], area_min: null, area_max: null })] });
  expect((await checkConditions.run({}, ctx)).data).toEqual({ error: "conditions_required" });
});
