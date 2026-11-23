import type { Fit } from "@/lib/calc/fit";
import { CONDITION_LABELS } from "../../../_components/ConditionCheckCard";
import { budgetBadge, unmetKeys } from "./fit-chips";

const label = (k: string) => CONDITION_LABELS[k] ?? k;

export function FitChips({ fit }: { fit: Fit }) {
  const b = budgetBadge(fit.within_budget);
  return (
    <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
      <span className={`rounded-full px-2.5 py-1 ${b.cls}`}>{b.text}</span>
      {fit.met.map((k) => <span key={k} className="rounded-full bg-chb-soft px-2.5 py-1 text-chb-accent">충족 {label(k)}</span>)}
      {unmetKeys(fit).map((k) => <span key={k} className="rounded-full bg-chb-line px-2.5 py-1 text-chb-muted">맞지 않음 {label(k)}</span>)}
      {fit.missing.map((k) => <span key={k} className="rounded-full border border-dashed border-chb-muted/50 px-2.5 py-1 text-chb-muted">데이터 없음 {label(k)}</span>)}
    </div>
  );
}
