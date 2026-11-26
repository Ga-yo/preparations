import { walkMinutes } from "@/lib/calc/walk";

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

// "○○학교(620m), 약 도보 9분". 도보 60분 이상은 걸어갈 곳이 아니라 보고 거리만 쓴다
export function placeText(name: string, m: number): string {
  const w = walkMinutes(m);
  return w >= 60 ? `${name}(${dist(m)})` : `${name}(${dist(m)}), 약 도보 ${w}분`;
}

// 가장 가까운 곳과 도보 분이 같은 곳만 보이고 나머지는 "외 n개"로. rows는 거리순, total은 1km 안 개수
export function nearestTies<T extends { distance_m: number }>(rows: T[], total: number): { shown: T[]; more: number } {
  if (!rows.length) return { shown: [], more: 0 };
  const w = walkMinutes(rows[0].distance_m);
  const shown = rows.filter((r) => walkMinutes(r.distance_m) === w);
  return { shown, more: Math.max(0, total - shown.length) };
}

// 4단계 상세 공용: 2단계 생활 조건 관련 값(M6). 값이 없으면 빼고, 다 없으면 null
export function livingText(r: { nearest_park_name?: string | null; nearest_park_m: number | null; shop_count_500m: number | null }): string | null {
  const parts = [
    r.nearest_park_m !== null && `가까운 공원 ${placeText(r.nearest_park_name ?? "공원", r.nearest_park_m)}`,
    r.shop_count_500m !== null && `반경 500m 생활 상가 ${r.shop_count_500m}곳`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

// 입력값에서 숫자만 남겨 천 단위 콤마를 붙인다. 앞자리 0은 지운다("006000" → "6,000")
export function groupDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// 콤마를 넣은 뒤에도 커서가 같은 숫자 뒤에 머물도록, n번째 숫자 바로 뒤의 위치를 돌려준다
export function caretAfterDigits(formatted: string, n: number): number {
  if (n <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i]) && ++seen === n) return i + 1;
  }
  return formatted.length;
}

// 떠 있는 버튼처럼 좁은 곳용 짧은 표기: 1억 이상은 소수 첫째 자리 억, 미만은 만 단위
export function formatEokShort(n: number): string {
  if (n >= 100_000_000) return `${Math.round(n / 10_000_000) / 10}억`; // 1억 미만을 "1억"으로 올리지 않게 원값으로 판정
  return `${Math.round(n / 10_000).toLocaleString("ko-KR")}만`;
}
