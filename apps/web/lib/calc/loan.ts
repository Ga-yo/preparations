// 월 상환계수(원금 1원당 월 상환액). 금리 0이면 균등 분할.
function paymentFactor(annualRatePct: number, termYears: number): number {
  const n = termYears * 12;
  const r = annualRatePct / 100 / 12;
  return r === 0 ? 1 / n : (r * (1 + r) ** n) / ((1 + r) ** n - 1);
}

/** 원리금균등 월 상환액(원, 반올림). */
export function monthlyPayment(
  principal: number,
  annualRatePct: number,
  termYears: number,
): number {
  return Math.round(principal * paymentFactor(annualRatePct, termYears));
}

/** DSR 한도 안에서 가능한 최대 원금. 소득 0·기존 상환액 초과 시 0(음수 없음). */
export function maxPrincipalByDsr(p: {
  annualIncome: number;
  existingAnnualPayment: number;
  dsrPct: number;
  annualRatePct: number;
  stressRatePct: number;
  termYears: number;
}): number {
  const room = (p.annualIncome * p.dsrPct) / 100 - p.existingAnnualPayment;
  if (!(room > 0)) return 0;
  return Math.max(
    0,
    Math.floor(
      room /
        (12 * paymentFactor(p.annualRatePct + p.stressRatePct, p.termYears)),
    ),
  );
}

/** LTV·한도·DSR 중 가장 작은 값. 동률이면 ltv > loan_cap > dsr 순으로 binding 표기. */
export function maxLoan(p: {
  price: number;
  ltvPct: number;
  capWon: number | null;
  dsrPrincipal: number;
}): { amount: number; binding: "ltv" | "loan_cap" | "dsr" } {
  const candidates = [
    { amount: Math.floor((p.price * p.ltvPct) / 100), binding: "ltv" as const },
    ...(p.capWon === null
      ? []
      : [{ amount: p.capWon, binding: "loan_cap" as const }]),
    { amount: p.dsrPrincipal, binding: "dsr" as const },
  ];
  return candidates.reduce((min, c) => (c.amount < min.amount ? c : min));
}
