import type { ConditionKey } from "@/lib/calc/conditions";
import type { Fit } from "@/lib/calc/fit";

export const budgetBadge = (b: boolean | null) =>
  b === true ? { text: "예산 안" as const, cls: "bg-chb-accent text-white" }
  : b === false ? { text: "예산 밖" as const, cls: "bg-red-50 text-red-800" }
  : { text: "예산 판단 불가" as const, cls: "bg-chb-line text-chb-muted" };

export const unmetKeys = (fit: Fit): ConditionKey[] => fit.unmet.filter((k) => !fit.missing.includes(k));
