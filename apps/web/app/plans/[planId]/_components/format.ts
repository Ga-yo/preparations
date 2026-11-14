// 만원 단위로 먼저 반올림한 뒤 억/만원으로 나눈다(반올림 올림수 방지). 1만원 미만은 원 단위.
export function formatWon(n: number): string {
  if (n < 10_000) return `${n.toLocaleString("ko-KR")}원`;
  const man = Math.round(n / 10_000);
  const eok = Math.floor(man / 10_000);
  const rest = man % 10_000;
  if (eok && rest) return `${eok}억 ${rest.toLocaleString("ko-KR")}만원`;
  if (eok) return `${eok}억원`;
  return `${rest.toLocaleString("ko-KR")}만원`;
}

const dist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`);

// 4단계 후보·상세, 5단계 비교 공용: 2단계 생활 조건 관련 값(M6). 값이 없으면 빼고, 다 없으면 null
export function livingText(r: { commute_m: number | null; nearest_park_m: number | null; shop_count_500m: number | null }): string | null {
  const parts = [
    r.commute_m !== null && `출퇴근 지역까지 직선 ${dist(r.commute_m)}`,
    r.nearest_park_m !== null && `공원 직선 ${dist(r.nearest_park_m)}`,
    r.shop_count_500m !== null && `반경 500m 생활 상가 ${r.shop_count_500m}곳`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
