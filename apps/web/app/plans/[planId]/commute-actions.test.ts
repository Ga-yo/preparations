import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const PLAN = "11111111-1111-4111-8111-111111111111";
const PTS = { from_lon: 127.1, from_lat: 37.5, to_lon: 127.0, to_lat: 37.4 };
let setRow: { data: unknown; error: { code: string } | null };
let rpcRes: { data: unknown; error: { code: string } | null };
const rpc = vi.fn();
const selects: [string, unknown[]][] = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const p: unknown = new Proxy(() => {}, {
        get: (_, k: string) =>
          k === "then" ? (f: (v: unknown) => unknown) => Promise.resolve(setRow).then(f)
            : (...a: unknown[]) => { selects.push([`${table}.${k}`, a]); return p; },
      });
      return p;
    },
    rpc: (...a: unknown[]) => { rpc(...a); return Promise.resolve(rpcRes); },
  }),
}));

const { commutePoints, carCommute } = await import("./commute-actions");
const fetchMock = vi.fn();
const kakaoOk = { ok: true, status: 200, json: async () => ({ routes: [{ result_code: 0, summary: { duration: 1527 } }] }) };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-25T03:00:00Z"));
  vi.stubEnv("KAKAO_MOBILITY_REST_KEY", "test-key");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset(); rpc.mockReset(); selects.length = 0;
  setRow = { data: { commute_station: "강남", commute_region_code: null }, error: null };
  rpcRes = { data: [PTS], error: null };
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("commutePoints", () => {
  test("invalid ids -> null, no DB", async () => {
    expect(await commutePoints("x", 7)).toBeNull();
    expect(await commutePoints(PLAN, 0)).toBeNull();
    expect(await commutePoints(PLAN, 1.5)).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
  test("no condition row / no commute -> null without rpc", async () => {
    setRow = { data: null, error: null };
    expect(await commutePoints(PLAN, 7)).toBeNull();
    setRow = { data: { commute_station: null, commute_region_code: null }, error: null };
    expect(await commutePoints(PLAN, 7)).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
  test("station wins over region code", async () => {
    setRow = { data: { commute_station: "강남", commute_region_code: "11680" }, error: null };
    expect(await commutePoints(PLAN, 7)).toEqual(PTS);
    expect(rpc).toHaveBeenCalledWith("route_points", { p_complex_id: 7, commute_station: "강남" });
  });
  test("region code only", async () => {
    setRow = { data: { commute_station: null, commute_region_code: "11680" }, error: null };
    await commutePoints(PLAN, 7);
    expect(rpc).toHaveBeenCalledWith("route_points", { p_complex_id: 7, commute_code: "11680" });
  });
  test("0 rows -> null; rpc error -> null and logs code", async () => {
    rpcRes = { data: [], error: null };
    expect(await commutePoints(PLAN, 7)).toBeNull();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    rpcRes = { data: null, error: { code: "42501" } };
    expect(await commutePoints(PLAN, 7)).toBeNull();
    expect(spy).toHaveBeenCalledWith("commute_points_failed", "42501");
  });
});

describe("carCommute", () => {
  const un = { status: "unavailable" };
  test("invalid / no row / no points -> unavailable, no fetch", async () => {
    expect(await carCommute("x", 7)).toEqual(un);
    expect(await carCommute(PLAN, 1.5)).toEqual(un);
    setRow = { data: null, error: null };
    expect(await carCommute(PLAN, 7)).toEqual(un);
    setRow = { data: { commute_station: "강남", commute_region_code: null }, error: null };
    rpcRes = { data: [], error: null };
    expect(await carCommute(PLAN, 7)).toEqual(un);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  test("calls kakao and parses", async () => {
    fetchMock.mockResolvedValue(kakaoOk);
    expect(await carCommute(PLAN, 7)).toEqual({ status: "ok", mode: "car", minutes: 25, transfers: null });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.startsWith("https://apis-navi.kakaomobility.com/v1/future/directions?")).toBe(true);
    expect(url).toContain("origin=127.1,37.5");
    expect(url).toContain("destination=127,37.4");
    expect(url).toContain("departure_time=202611260800");
    expect(url).toContain("summary=true");
    expect(init.headers.Authorization).toBe("KakaoAK test-key");
  });
  test("fetch reject / !ok -> unavailable, log has no URL", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockRejectedValueOnce(new Error("https://x?key=test-key"));
    expect(await carCommute(PLAN, 7)).toEqual(un);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 });
    expect(await carCommute(PLAN, 7)).toEqual(un);
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/http|test-key/);
  });
  test("missing key -> unavailable", async () => {
    vi.stubEnv("KAKAO_MOBILITY_REST_KEY", "");
    expect(await carCommute(PLAN, 7)).toEqual(un);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
