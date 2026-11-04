import { expect, test } from "vitest";
import { fakeDb } from "./fake-db";
import { resolveRegion } from "./region";

const regions = [
  { code: "1114000000", full_name: "서울특별시 중구", is_active: true },
  { code: "2611000000", full_name: "부산광역시 중구", is_active: true },
  { code: "1168000000", full_name: "서울특별시 강남구", is_active: true },
  { code: "1100000001", full_name: "서울특별시 옛구", is_active: false },
];

test("모호한 지역명은 후보를 돌려준다", async () => {
  const r = await resolveRegion(fakeDb({ regions }), "중구");
  expect(r).toEqual({ status: "ambiguous", candidates: expect.arrayContaining([expect.objectContaining({ fullName: "부산광역시 중구" })]) });
});
test("완전일치는 ok (공백 정규화)", async () => {
  expect(await resolveRegion(fakeDb({ regions }), " 서울특별시   중구 ")).toEqual({ status: "ok", code: "1114000000", fullName: "서울특별시 중구" });
});
test("시도 없이 입력해도 끝부분 일치로 ok", async () => {
  expect(await resolveRegion(fakeDb({ regions }), "강남구")).toMatchObject({ status: "ok", code: "1168000000" });
});
test("없는 지역·비활성 지역은 not_found", async () => {
  expect(await resolveRegion(fakeDb({ regions }), "없는구")).toEqual({ status: "not_found" });
  expect(await resolveRegion(fakeDb({ regions }), "옛구")).toEqual({ status: "not_found" });
});
