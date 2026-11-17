"use client";
import { useEffect, useState } from "react";
import { debtPaymentRatio, ownFunds } from "@/lib/calc/funds";
import { formatWon } from "./format";

// 금액은 만원 단위(입력칸 그대로)
export type Snapshot = {
  purpose: string; timeline: string;
  cash: number | null; income: number | null; debt: number | null; debtPayment: number | null; extra: number | null;
  houses: number | null; firstTime: boolean; newlywed: boolean; newborn: boolean;
};

const PURPOSE: Record<string, string> = { live: "실거주", invest: "투자", both: "실거주 및 투자" };
const TIMELINE: Record<string, string> = { "6m": "6개월 이내", "1y": "1년 이내", "2_3y": "2~3년 이내", undecided: "시기 미정" };

const man = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").replace(/,/g, "").trim();
  return s ? Number(s) : null;
};
function read(form: HTMLFormElement): Snapshot {
  const f = new FormData(form);
  return {
    purpose: String(f.get("purpose") ?? ""), timeline: String(f.get("timeline") ?? ""),
    cash: man(f.get("cash_assets")), income: man(f.get("annual_income")), debt: man(f.get("existing_debt")),
    debtPayment: man(f.get("existing_debt_annual_payment")), extra: man(f.get("extra_funds")), houses: man(f.get("owned_house_count")),
    firstTime: f.has("is_first_time"), newlywed: f.has("is_newlywed"), newborn: f.has("has_newborn"),
  };
}

// 입력하는 대로 바뀌는 요약. 폼 밖에 있어 form 속성으로 제출 버튼을 폼에 연결한다
export function InputSummary({ formId, initial }: { formId: string; initial: Snapshot }) {
  const [s, setS] = useState(initial);
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const update = () => setS(read(form));
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    return () => { form.removeEventListener("input", update); form.removeEventListener("change", update); };
  }, [formId]);

  const filled = [s.purpose, s.timeline, s.cash, s.income, s.debt, s.debtPayment, s.extra, s.houses]
    .filter((v) => v !== "" && v !== null).length;
  const funds = ownFunds(s.cash, s.extra);
  const ratio = debtPaymentRatio(s.debtPayment, s.income);
  const quals = [s.firstTime && "생애 최초", s.newlywed && "신혼부부", s.newborn && "출산 가구"].filter(Boolean) as string[];
  const chips = [
    PURPOSE[s.purpose], TIMELINE[s.timeline],
    s.houses === null ? null : s.houses === 0 ? "무주택" : `${s.houses}주택`,
    ...(quals.length ? quals : ["해당 없음"]),
  ].filter(Boolean) as string[];

  return (
    <section aria-label="입력 요약" className="rounded-3xl border border-chb-line bg-white p-6">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl font-black tracking-tight">입력 요약</h2>
        <p className="text-sm text-chb-muted">입력 진행 {filled}/8</p>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-chb-line" aria-hidden="true">
        <div className="h-full rounded-full bg-chb-accent transition-all" style={{ width: `${(filled / 8) * 100}%` }} />
      </div>

      <div className="mt-6 border-b border-chb-line pb-6">
        <p className="text-sm text-chb-muted">구매에 쓸 수 있는 내 돈</p>
        <p className="mt-1 font-display text-3xl font-black tracking-tight">{formatWon(funds * 10_000)}</p>
        <p className="mt-1 text-sm text-chb-muted">
          보유 현금 {formatWon((s.cash ?? 0) * 10_000)} + 추가 자금 {formatWon((s.extra ?? 0) * 10_000)}
        </p>
      </div>

      <div className="border-b border-chb-line py-6">
        <p className="flex items-baseline justify-between text-sm">
          <span>연소득 중 기존 대출 상환 비율</span>
          <span className="text-base font-bold">{ratio === null ? "-" : `${ratio.toFixed(1)}%`}</span>
        </p>
        <div className="mt-2 h-2 rounded-full bg-chb-line" aria-hidden="true">
          <div className="h-full rounded-full bg-chb-accent transition-all" style={{ width: `${Math.min(ratio ?? 0, 100)}%` }} />
        </div>
        <p className="mt-2 text-sm text-chb-muted">
          {ratio === null ? "연 소득을 입력하면 계산돼요." : "이 비율이 높을수록 새로 받을 수 있는 대출 한도가 줄어들어요."}
        </p>
      </div>

      <ul className="flex flex-wrap gap-2 py-6" aria-label="선택한 조건">
        {chips.map((c) => <li key={c} className="rounded-full bg-chb-soft px-3 py-1.5 text-sm font-semibold text-chb-accent">{c}</li>)}
      </ul>

      <button type="submit" form={formId} className="w-full rounded-full bg-chb-accent py-4 text-lg font-bold text-white shadow-[0_16px_32px_-14px_rgba(46,125,91,0.55)] transition hover:-translate-y-0.5">
        예산 계산하기
      </button>
    </section>
  );
}
