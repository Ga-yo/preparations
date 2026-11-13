export type FeeItem = { group: "common" | "individual"; key: string; amount: number };

// K-apt 금액은 단지 전체 월 부과 합계(원)이므로 ㎡당은 관리비 부과면적으로 나눈다
export function summarizeMgmtFee(items: FeeItem[], chargeAreaM2: number | null) {
  const sum = (g: FeeItem["group"]) => items.filter((i) => i.group === g).reduce((a, i) => a + i.amount, 0);
  const common = sum("common");
  const individual = sum("individual");
  const total = common + individual;
  return { common, individual, total, per_m2: chargeAreaM2 ? Math.round(total / chargeAreaM2) : null };
}
