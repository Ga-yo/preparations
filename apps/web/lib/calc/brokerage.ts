// 매매 중개보수 상한(공인중개사법 시행규칙 별표 4, 서울시 조례). VAT 별도: 반환값은 VAT 제외 금액.
const TIERS: { below: number; ratePct: number; cap?: number }[] = [
  { below: 50_000_000, ratePct: 0.6, cap: 250_000 },
  { below: 200_000_000, ratePct: 0.5, cap: 800_000 },
  { below: 900_000_000, ratePct: 0.4 },
  { below: 1_200_000_000, ratePct: 0.5 },
  { below: 1_500_000_000, ratePct: 0.6 },
  { below: Infinity, ratePct: 0.7 },
];

export function brokerageFee(price: number): { ratePct: number; fee: number; capped: boolean } {
  const t = TIERS.find((x) => price < x.below)!;
  const raw = Math.floor((price * t.ratePct) / 100);
  const capped = t.cap !== undefined && raw > t.cap;
  return { ratePct: t.ratePct, fee: capped ? t.cap! : raw, capped };
}
