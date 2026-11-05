import { describe, expect, test } from "vitest";
import { fakeDb } from "@/lib/agent/fake-db";
import { resolveStage2Regions, stage2Schema } from "./actions";

const db = fakeDb({
  capital_sigungu: [{ sigungu_code: "11680" }, { sigungu_code: "11140" }],
  regions: [
    { code: "1168010300", full_name: "서울특별시 강남구 개포동", is_active: true },
    { code: "1114000000", full_name: "서울특별시 중구", is_active: true },
    { code: "2611000000", full_name: "부산광역시 중구", is_active: true },
  ],
});
const none = { sigungu_codes: [], dong_names: [], commute_region_name: null };

describe("stage2Schema", () => {
  test("빈 폼은 전부 null/false/[]", () => {
    expect(stage2Schema.parse({ sigungu_codes: [], environment_prefs: [] })).toEqual({
      sigungu_codes: [], dong_names: [], commute_region_name: null, commute_minutes_max: null,
      uses_transit: false, parking_required: false, school_importance: null, infra_importance: null,
      household_size: null, rooms_min: null, area_min: null, area_max: null, environment_prefs: [], region_reason: null,
    });
  });
  test("area_min > area_max → area_max 오류", () => {
    const r = stage2Schema.safeParse({ area_min: "100", area_max: "60" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["area_max"]);
  });
  test("environment_prefs는 허용값만", () => {
    expect(stage2Schema.safeParse({ environment_prefs: ["quiet", "near_park"] }).success).toBe(true);
    expect(stage2Schema.safeParse({ environment_prefs: ["pool"] }).success).toBe(false);
  });
  test("sigungu_codes 11개는 거부", () => {
    expect(stage2Schema.safeParse({ sigungu_codes: Array.from({ length: 11 }, (_, i) => String(11000 + i)) }).success).toBe(false);
  });
  test("dong_names 쉼표 분리·공백 제거·빈 항목 무시", () => {
    expect(stage2Schema.parse({ dong_names: " 개포동, ,역삼동 " }).dong_names).toEqual(["개포동", "역삼동"]);
  });
  test("숫자 범위: 통근 9분·중요도 6 거부", () => {
    expect(stage2Schema.safeParse({ commute_minutes_max: "9" }).success).toBe(false);
    expect(stage2Schema.safeParse({ school_importance: "6" }).success).toBe(false);
  });
});

describe("resolveStage2Regions", () => {
  test("체크박스 코드는 10자리로, 희망 동 코드는 뒤에 추가", async () => {
    expect(await resolveStage2Regions(db, { sigungu_codes: ["11680"], dong_names: ["강남구 개포동"], commute_region_name: null }))
      .toEqual({ ok: true, region_codes: ["1168000000", "1168010300"], commute_region_code: null });
  });
  test("capital_sigungu에 없는 코드(변조 26110) → sigungu_codes 오류", async () => {
    expect(await resolveStage2Regions(db, { ...none, sigungu_codes: ["11680", "26110"] })).toMatchObject({ ok: false, fieldErrors: { sigungu_codes: expect.any(Array) } });
  });
  test("모호한 희망 동·통근 지역 → 해당 필드 오류", async () => {
    expect(await resolveStage2Regions(db, { ...none, dong_names: ["중구"] })).toMatchObject({ ok: false, fieldErrors: { dong_names: expect.any(Array) } });
    expect(await resolveStage2Regions(db, { ...none, commute_region_name: "중구" })).toMatchObject({ ok: false, fieldErrors: { commute_region_name: expect.any(Array) } });
  });
  test("통근 지역 이름 → 코드", async () => {
    expect(await resolveStage2Regions(db, { ...none, commute_region_name: "강남구 개포동" })).toEqual({ ok: true, region_codes: [], commute_region_code: "1168010300" });
  });
});
