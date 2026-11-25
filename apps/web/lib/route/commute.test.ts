import { afterEach, expect, test, vi } from "vitest";
import { walkMinutes } from "@/lib/calc/walk";
import {
  cacheKey, commuteTarget, nextWeekday0800Kst, parseKakao, parseOdsay,
  readCache, straightMeters, writeCache,
} from "./commute";

afterEach(() => vi.unstubAllGlobals());

function stubStorage() {
  const m = new Map<string, string>();
  const setItem = vi.fn((k: string, v: string) => void m.set(k, v));
  vi.stubGlobal("sessionStorage", { getItem: (k: string) => m.get(k) ?? null, setItem });
  return { m, setItem };
}

test("commuteTarget: 대중교통 체크면 transit, 아니면(null 포함) car, 출퇴근지 없으면 null", () => {
  expect(commuteTarget({ uses_transit: true, commute_station: "강남", commute_region_code: null })).toEqual({ mode: "transit", key: "station:강남", label: "강남역" });
  expect(commuteTarget({ uses_transit: null, commute_station: null, commute_region_code: "1168010100" })?.mode).toBe("car");
  expect(commuteTarget({ uses_transit: true, commute_station: null, commute_region_code: null })).toBeNull();
});
test("commuteTarget: 역 이름이 이미 '역'으로 끝나면 중복하지 않고, 역이 지역보다 우선", () => {
  expect(commuteTarget({ uses_transit: false, commute_station: "강남역", commute_region_code: "1168010100" })).toEqual({ mode: "car", key: "station:강남역", label: "강남역" });
  expect(commuteTarget({ uses_transit: false, commute_station: null, commute_region_code: "1168010100" })).toEqual({ mode: "car", key: "region:1168010100", label: "출퇴근 지역" });
});
test("parseOdsay: totalTime, 환승 = 버스+지하철 탑승 − 1", () => {
  const ok = { result: { path: [{ info: { totalTime: 28, busTransitCount: 0, subwayTransitCount: 3 } }] } };
  expect(parseOdsay(ok, 12000)).toEqual({ status: "ok", mode: "transit", minutes: 28, transfers: 2 });
});
test("parseOdsay: -98(700m 이내)은 near", () => {
  expect(parseOdsay({ error: { code: "-98", msg: "x" } }, 400)).toEqual({ status: "near", walkMinutes: walkMinutes(400) });
});
test("parseOdsay: 다른 오류나 이상한 모양은 unavailable", () => {
  expect(parseOdsay({ error: [{ code: "500", message: "[ApiKeyAuthFailed]" }] }, 5000).status).toBe("unavailable");
  expect(parseOdsay(null, 5000).status).toBe("unavailable");
  expect(parseOdsay({ result: { path: [] } }, 5000).status).toBe("unavailable");
});
test("parseKakao: duration 초 → 분 반올림, 104는 near, 그 외 result_code는 unavailable", () => {
  expect(parseKakao({ routes: [{ result_code: 0, summary: { duration: 1527 } }] }, 12000)).toEqual({ status: "ok", mode: "car", minutes: 25, transfers: null });
  expect(parseKakao({ routes: [{ result_code: 104 }] }, 3).status).toBe("near");
  expect(parseKakao({ routes: [{ result_code: 103 }] }, 9000).status).toBe("unavailable");
  expect(parseKakao(undefined, 9000).status).toBe("unavailable");
});
test("nextWeekday0800Kst: KST 기준 다음 평일 08:00", () => {
  expect(nextWeekday0800Kst(new Date("2026-11-25T03:00:00Z"))).toBe("202611260800");
  expect(nextWeekday0800Kst(new Date("2026-11-27T00:00:00Z"))).toBe("202611300800");
  expect(nextWeekday0800Kst(new Date("2026-11-26T22:30:00Z"))).toBe("202611300800");
});
test("straightMeters: 강남역 → 여의도역 약 9.5km", () => {
  const d = straightMeters({ from_lon: 127.0276, from_lat: 37.4979, to_lon: 126.9246, to_lat: 37.5215 });
  expect(Math.abs(d - 9457)).toBeLessThanOrEqual(200);
});
test("cacheKey", () => {
  expect(cacheKey({ mode: "car", key: "station:강남", label: "강남역" }, 7)).toBe("commute:car:station:강남:7");
});
test("readCache/writeCache: sessionStorage가 throw해도 null·무시", () => {
  vi.stubGlobal("sessionStorage", { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } });
  expect(readCache("k")).toBeNull();
  expect(() => writeCache("k", { status: "unavailable" })).not.toThrow();
});
test("unavailable은 캐시하지 않고 ok·near는 왕복된다", () => {
  const { m, setItem } = stubStorage();
  writeCache("a", { status: "unavailable" });
  expect(setItem).not.toHaveBeenCalled();
  expect(m.size).toBe(0);
  writeCache("b", { status: "ok", mode: "car", minutes: 5, transfers: null });
  writeCache("c", { status: "near", walkMinutes: 4 });
  expect(readCache("b")).toEqual({ status: "ok", mode: "car", minutes: 5, transfers: null });
  expect(readCache("c")).toEqual({ status: "near", walkMinutes: 4 });
});
test("readCache: 깨진 JSON·이상한 모양은 null", () => {
  const { m } = stubStorage();
  m.set("x", "{not json");
  m.set("y", JSON.stringify({ status: "weird" }));
  m.set("z", JSON.stringify(null));
  expect(readCache("x")).toBeNull();
  expect(readCache("y")).toBeNull();
  expect(readCache("z")).toBeNull();
});
