// 단위와 무관한 순수 함수: 원이든 만원이든 같은 단위로 넣으면 같은 단위로 돌려준다

// 구매에 쓸 수 있는 자기자금 = 보유 현금·자기자본 + 추가 가용 자금
export function ownFunds(cashAssets: number | null, extraFunds: number | null): number {
  return (cashAssets ?? 0) + (extraFunds ?? 0);
}

// 연 소득 중 기존 대출 연간 원리금 상환액의 비율(%). 소득을 모르면 null
export function debtPaymentRatio(annualPayment: number | null, annualIncome: number | null): number | null {
  if (!annualIncome || annualIncome <= 0) return null;
  return ((annualPayment ?? 0) / annualIncome) * 100;
}
