import { describe, expect, it } from "vitest";
import map from "./sigungu-map.json";
import { MAX_SIGUNGU, toggleCode } from "./SigunguPicker";

describe("toggleCode", () => {
  it("추가·해제하고 최대 개수에서는 더 넣지 않는다", () => {
    expect(toggleCode([], "11110")).toEqual(["11110"]);
    expect(toggleCode(["11110", "11140"], "11110")).toEqual(["11140"]);
    const full = Array.from({ length: MAX_SIGUNGU }, (_, i) => String(11000 + i));
    expect(toggleCode(full, "41150")).toBe(full);
    expect(toggleCode(full, full[0])).toHaveLength(MAX_SIGUNGU - 1);
  });
});

describe("sigungu-map.json", () => {
  it("수도권 시군구 83곳의 경계와 시·도 확대 범위가 있다", () => {
    const codes = Object.keys(map.paths);
    // 2026-11-19 원격 capital_sigungu 83곳과 대조함. 시군구 개편 시 scripts/build_sigungu_map.py로 다시 만든다
    expect(codes).toHaveLength(83);
    expect(codes.every((c) => /^(11|28|41)\d{3}$/.test(c) && map.paths[c as keyof typeof map.paths].startsWith("M"))).toBe(true);
    expect(Object.keys(map.sido)).toEqual(["서울특별시", "인천광역시", "경기도"]);
  });

  // Value: protects=확대 시 이름 표시(labels [x,y,w])와 fontSize 계산(box의 3번째 수); fails_when=재생성한 JSON에 라벨이 빠지거나 viewBox 형식이 깨져 NaN 글자 크기가 됨; why_new=기존 테스트는 paths·sido 키만 봄; seam=none; no_claim=렌더링·라벨 폭 임계값은 검증하지 않음
  it("시군구마다 라벨 위치가 있고 viewBox는 숫자 4개다", () => {
    expect(Object.keys(map.labels).sort()).toEqual(Object.keys(map.paths).sort());
    expect(Object.values(map.labels).every((l) => l.length === 3 && l.every(Number.isFinite) && l[2] > 0)).toBe(true);
    for (const box of [map.viewBox, ...Object.values(map.sido)]) {
      const n = box.split(" ").map(Number);
      expect(n).toHaveLength(4);
      expect(n.every(Number.isFinite) && n[2] > 0 && n[3] > 0).toBe(true);
    }
  });
});
