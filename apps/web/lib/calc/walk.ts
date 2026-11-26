export const WALK_SOURCE =
  "우회 계수 1.3: Héran(2009), 일반 도시 1.15~1.25·보행 방해 지역 1.3 이상(황지상·유석연 2026, 국토계획 61(3) 재인용)의 상단, 단지 담장을 보행 방해로 봄. " +
  "보행속도 1.29m/s(77.4m/분): 한음 외(2020), 한국ITS학회논문지 19(4) 45~54쪽, 횡단보도 4,857명 실측 일반인 평균";

// 직선거리 × 1.3 ÷ 77.4m/분 (출처는 WALK_SOURCE)
export const WALK_DETOUR = 1.3;
export const WALK_M_PER_MIN = 1.29 * 60;

export function walkMinutes(straightM: number): number {
  return Math.max(1, Math.ceil((straightM * WALK_DETOUR) / WALK_M_PER_MIN));
}
