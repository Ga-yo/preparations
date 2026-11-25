export const WALK_SOURCE =
  "관례값(우회 계수 1.3, 분당 67m = 시속 4km 안팎). 공식 출처 미확정: 도로용량편람 등 원문 확인 전까지 '약'으로만 표시";

// 출처 미확정 관례값: 직선거리 대비 실제 보행 경로 1.3배, 보행속도 67m/분 (WALK_SOURCE 참고)
export const WALK_DETOUR = 1.3;
export const WALK_M_PER_MIN = 67;

export function walkMinutes(straightM: number): number {
  return Math.max(1, Math.ceil((straightM * WALK_DETOUR) / WALK_M_PER_MIN));
}
