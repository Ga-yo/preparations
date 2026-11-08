import { describe, expect, test } from "vitest";
import { stage3Row, stage3Schema } from "./actions";

describe("stage3Schema", () => {
  test("빈 폼은 전부 null/false/[]/{}", () => {
    expect(stage3Schema.parse({ housing_types: [] })).toEqual({
      housing_types: [], price_min: null, price_max: null, area_min: null, area_max: null,
      rooms_min: null, baths_min: null, floor_pref: null, direction_pref: null,
      approval_year_min: null, household_count_min: null, parking_per_household_min: null,
      mgmt_fee_per_m2_max: null, floor_area_ratio_max: null, redevelopment_interest: false, priorities: {},
    });
  });
  test("가격은 만원 입력 → 원", () => {
    expect(stage3Schema.parse({ price_max: "90000" }).price_max).toBe(900_000_000);
  });
  test("price_min > price_max → price_max 오류", () => {
    const r = stage3Schema.safeParse({ price_min: "90000", price_max: "50000" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["price_max"]);
  });
  test("housing_types·floor_pref는 허용값만", () => {
    expect(stage3Schema.safeParse({ housing_types: ["apartment", "officetel", "row_house"] }).success).toBe(true);
    expect(stage3Schema.safeParse({ housing_types: ["villa"] }).success).toBe(false);
    expect(stage3Schema.safeParse({ floor_pref: "top" }).success).toBe(false);
  });
  test("우선순위: 값이 있는 조건만 저장", () => {
    const v = stage3Schema.parse({
      household_count_min: "1000", "priority.household_count_min": "must",
      "priority.approval_year_min": "must", // 준공 연도 미입력 → 저장 안 함
      area_min: "80", "priority.area": "prefer",
    });
    expect(v.priorities).toEqual({ household_count_min: "must", area: "prefer" });
  });
  test("우선순위 값은 must|prefer|ignore만", () => {
    expect(stage3Schema.safeParse({ household_count_min: "1000", "priority.household_count_min": "always" }).success).toBe(false);
  });
  test("숫자 범위: 세대당 주차 소수, 준공 1949 거부", () => {
    expect(stage3Schema.parse({ parking_per_household_min: "1.2" }).parking_per_household_min).toBe(1.2);
    expect(stage3Schema.safeParse({ approval_year_min: "1949" }).success).toBe(false);
  });
});

describe("stage3Row", () => {
  test("최신 행의 2단계 값은 보존하고 3단계 값만 덮는다(id·created_at 제외)", () => {
    const latest = { id: "old", created_at: "x", plan_id: "p1", user_id: "u1", region_codes: ["1168000000"], household_size: 3, area_min: 59, price_max: 1 };
    const values = stage3Schema.parse({ price_max: "90000", area_min: "84" });
    const row = stage3Row(latest, values, "p1", "u1");
    expect(row).toMatchObject({ region_codes: ["1168000000"], household_size: 3, area_min: 84, price_max: 900_000_000, plan_id: "p1", user_id: "u1" });
    expect(row).not.toHaveProperty("id");
    expect(row).not.toHaveProperty("created_at");
  });
  test("이전 행이 없으면 3단계 값만", () => {
    expect(stage3Row(null, stage3Schema.parse({}), "p1", "u1")).toMatchObject({ plan_id: "p1", user_id: "u1", priorities: {} });
  });
});
