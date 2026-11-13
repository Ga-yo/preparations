import { afterEach, beforeEach, expect, test, vi } from "vitest";
import list from "./fixtures/list-1168010300.json";
import bass from "./fixtures/bass-A10024564.json";
import cmnuse from "./fixtures/cmnuse-A10024564-202609.json";
import laborEmpty from "./fixtures/labor-A10024564-202610-empty.json";
import notRegistered from "./fixtures/not-registered-403.json";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));
const { getMgmtFee, INDIVIDUAL_OPS } = await import("./mgmt-fee");
const { KaptError, kaptGet } = await import("./client");

const KEY = "test-secret-key+/=";
const TODAY = "2026-11-12"; // 전월 2026-10, 전전월 2026-09
const COMMON_TOTAL = 401_184_654; // fixture 17개 오퍼레이션 합계
const forest = { id: 1, name: "개포래미안포레스트", region_code: "1168010300", jibun_address: "서울특별시 강남구 개포동 1282번지" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const empty = { response: { header: { resultCode: "00" }, body: { item: { kaptCode: null, kaptName: null } } } };

type Opts = { individual?: "registered" | "not_registered" | "empty"; bassOther?: boolean };
// 경로·파라미터로 fixture를 고른다. 개별사용료는 활용신청 전이라 실제 응답이 403뿐이어서 성공 응답은 합성한다
function router({ individual = "not_registered", bassOther = false }: Opts = {}) {
  return vi.fn(async (input: string | URL) => {
    const u = new URL(String(input));
    const [service, op] = u.pathname.replace("/1613000/", "").split("/");
    const p = u.searchParams;
    if (op === "getLegaldongAptList4") return json(list);
    if (op === "getAphusBassInfoV5") {
      if (p.get("kaptCode") === "A10024564") return json(bass);
      return json({ response: { header: { resultCode: "00" }, body: { item: { ...bass.response.body.item, kaptCode: p.get("kaptCode"), kaptAddr: bassOther ? "서울특별시 강남구 개포동 9999 다른단지" : "서울특별시 강남구 개포동 1 기타" } } } });
    }
    if (service === "AptCmnuseManageCostServiceV3") {
      if (p.get("searchDate") === "202610") return json(laborEmpty);
      return json((cmnuse as Record<string, unknown>)[op]);
    }
    if (service === "AptIndvdlzManageCostServiceV3") {
      if (individual === "not_registered") return json(notRegistered, 403);
      if (individual === "empty") return json(empty);
      const fields = INDIVIDUAL_OPS[op as keyof typeof INDIVIDUAL_OPS];
      return json({ response: { header: { resultCode: "00" }, body: { item: { kaptCode: "A10024564", ...Object.fromEntries(fields.map((f) => [f, 100_000])) } } } });
    }
    throw new Error(`unexpected ${op}`);
  });
}
const calledOps = (f: ReturnType<typeof router>) => f.mock.calls.map(([i]) => new URL(String(i)).pathname.split("/").pop());

beforeEach(() => { vi.stubEnv("DATA_GO_KR_SERVICE_KEY", KEY); vi.stubEnv("KAPT_INDIVIDUAL_FEES", "1"); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

test("matches by normalized name", async () => {
  const f = router({ individual: "registered" });
  vi.stubGlobal("fetch", f);
  const r = await getMgmtFee({ ...forest, name: "개포 래미안포레스트 아파트" }, TODAY);
  expect(r).toMatchObject({
    status: "ok", kapt_code: "A10024564", kapt_name: "개포래미안포레스트", month: "2026-09",
    common: COMMON_TOTAL, individual: 1_500_000, total: COMMON_TOTAL + 1_500_000, per_m2: 1644, partial: false, individual_status: "ok",
  });
  expect(r.status === "ok" && r.fetched_at).toMatch(/^\d{4}-\d\d-\d\dT/);
  // 지번 대조 1회 + 면적용 1회. 운영에서는 같은 kaptCode의 'use cache: remote'라 두 번째는 캐시 적중
  expect(calledOps(f).filter((o) => o === "getAphusBassInfoV5")).toHaveLength(2);
});

test("single exact name with a different jibun is rejected", async () => {
  vi.stubGlobal("fetch", router());
  expect(await getMgmtFee({ ...forest, jibun_address: "서울특별시 강남구 개포동 5번지" }, TODAY))
    .toEqual({ status: "not_found", reason: "no_kapt_match" });
});

test("falls back to jibun via basis info", async () => {
  vi.stubGlobal("fetch", router({ bassOther: true }));
  const r = await getMgmtFee({ ...forest, name: "래미안포레스트" }, TODAY);
  expect(r).toMatchObject({ status: "ok", kapt_code: "A10024564" });
});

test("no_kapt_match", async () => {
  const f = router({ bassOther: true });
  vi.stubGlobal("fetch", f);
  expect(await getMgmtFee({ ...forest, name: "없는단지" }, TODAY)).toEqual({ status: "not_found", reason: "no_kapt_match" });
  // 이름이 비슷한 후보가 있어도 지번이 다르면 못 정한다
  expect(await getMgmtFee({ ...forest, name: "래미안", jibun_address: "서울특별시 강남구 개포동 5번지" }, TODAY))
    .toEqual({ status: "not_found", reason: "no_kapt_match" });
});

test("uses previous-previous month when last month empty", async () => {
  const f = router();
  vi.stubGlobal("fetch", f);
  const r = await getMgmtFee(forest, TODAY);
  expect(r).toMatchObject({ status: "ok", month: "2026-09" });
  const months = f.mock.calls.map(([i]) => new URL(String(i)).searchParams.get("searchDate")).filter(Boolean);
  expect(months.filter((m) => m === "202610")).toEqual(["202610"]); // 전월은 탐색 1회만
  expect(calledOps(f).filter((o) => o?.endsWith("InfoV3") && o.startsWith("getHsmpLabor"))).toHaveLength(2);
});

test("falls back to month-3 and probes each month once", async () => {
  const r3 = router();
  const f = vi.fn(async (i: string | URL) => (String(i).includes("getHsmpLaborCostInfoV3") && String(i).includes("searchDate=202609") ? json(empty) : r3(i)));
  vi.stubGlobal("fetch", f);
  expect(await getMgmtFee(forest, TODAY)).toMatchObject({ status: "ok", month: "2026-08" });
  const probes = f.mock.calls.filter(([i]) => String(i).includes("getHsmpLaborCostInfoV3")).map(([i]) => new URL(String(i)).searchParams.get("searchDate"));
  expect(probes.slice(0, 3)).toEqual(["202610", "202609", "202608"]);
});

test("no_recent_fee when all three months empty", async () => {
  vi.stubGlobal("fetch", vi.fn(async (i: string | URL) => (String(i).includes("ManageCost") ? json(empty) : router()(i))));
  expect(await getMgmtFee(forest, TODAY)).toEqual({ status: "not_found", reason: "no_recent_fee" });
});

test("individual unavailable gives partial common-only result and logs no key", async () => {
  const errors: unknown[] = [];
  vi.spyOn(console, "error").mockImplementation((...a) => { errors.push(a); });
  vi.stubGlobal("fetch", router({ individual: "not_registered" }));
  const r = await getMgmtFee(forest, TODAY);
  expect(r).toMatchObject({ status: "ok", common: COMMON_TOTAL, individual: null, total: COMMON_TOTAL, per_m2: 1638, partial: true, individual_status: "unavailable" });
  expect(errors).toEqual([["kapt individual fee failed", { complex_id: 1, status: 403, name: "HttpError" }]]);
});

test("individual flag off skips the 10 individual operations", async () => {
  vi.stubEnv("KAPT_INDIVIDUAL_FEES", "");
  const f = router({ individual: "registered" });
  vi.stubGlobal("fetch", f);
  expect(await getMgmtFee(forest, TODAY)).toMatchObject({ status: "ok", individual: null, total: COMMON_TOTAL, partial: true, individual_status: "disabled" });
  expect(f.mock.calls.some(([i]) => String(i).includes("AptIndvdlzManageCostServiceV3"))).toBe(false);
});

test("individual enabled but empty for the month", async () => {
  vi.stubGlobal("fetch", router({ individual: "empty" }));
  expect(await getMgmtFee(forest, TODAY)).toMatchObject({ status: "ok", individual: null, partial: true, individual_status: "empty" });
});

test("individual partly failing still counts as unavailable", async () => {
  const ok = router({ individual: "registered" });
  vi.stubGlobal("fetch", vi.fn(async (i: string | URL) => (String(i).includes("getHsmpHeatCostInfo") ? Promise.reject(new TypeError("fetch failed")) : ok(i))));
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await getMgmtFee(forest, TODAY)).toMatchObject({ status: "ok", individual: null, partial: true, individual_status: "unavailable" });
});

test("fee failure does not break detail", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
  await expect(getMgmtFee(forest, TODAY)).resolves.toEqual({ status: "error" });
  // 공용관리비가 실패하면 오류
  const ok = router();
  vi.stubGlobal("fetch", vi.fn(async (i: string | URL) => (String(i).includes("getHsmpGuardCost") ? json({}, 500) : ok(i))));
  await expect(getMgmtFee(forest, TODAY)).resolves.toEqual({ status: "error" });
});

test("errors are not cached", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const fail = vi.fn(async () => json({}, 503));
  vi.stubGlobal("fetch", fail);
  expect(await getMgmtFee(forest, TODAY)).toEqual({ status: "error" });
  const ok = router();
  vi.stubGlobal("fetch", ok);
  expect(await getMgmtFee(forest, TODAY)).toMatchObject({ status: "ok" });
  expect(ok).toHaveBeenCalled();
});

test("error message has no key", async () => {
  const errors: unknown[] = [];
  vi.spyOn(console, "error").mockImplementation((...a) => { errors.push(a); });
  vi.stubGlobal("fetch", vi.fn(async (i: string | URL) => { throw new TypeError(`fetch failed ${String(i)}`); }));
  const e = await kaptGet("AptListService4/getLegaldongAptList4", { bjdCode: "1168010300" }).catch((x: unknown) => x);
  expect(e).toBeInstanceOf(KaptError);
  expect(e).toMatchObject({ status: null, name: "TypeError" });
  expect(String((e as Error).message) + String((e as Error).stack)).not.toContain(KEY);
  expect((e as Error).cause).toBeUndefined();
  vi.stubGlobal("fetch", vi.fn(async () => json(notRegistered, 403)));
  const e2 = await kaptGet("AptListService4/getLegaldongAptList4", { bjdCode: "1168010300" }).catch((x: unknown) => x);
  expect(e2).toMatchObject({ status: 403 });
  expect(String((e2 as Error).message)).not.toMatch(/apis\.data\.go\.kr|serviceKey/);
  await getMgmtFee(forest, TODAY);
  expect(JSON.stringify(errors)).not.toContain(KEY);
  expect(JSON.stringify(errors)).not.toContain("apis.data.go.kr");
});
