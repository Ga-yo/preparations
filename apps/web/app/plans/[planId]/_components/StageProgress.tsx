"use client";
import { useEffect, useState } from "react";
import { readStage3, STAGE3_KEYS } from "../stage/3/_components/readStage3";

type Progress = { filled: number; total: number };

const filledText = (v: FormDataEntryValue | null) => String(v ?? "").replace(/,/g, "").trim() !== "";

// 1단계: 목적·시기·현금·소득·부채·부채 상환액·추가 자금·주택 수 8개. 부채 체크를 안 했으면 부채 두 칸은 0으로 본다(저장 규칙과 같음)
function stage1(f: FormData): Progress {
  const debt = (k: string) => !f.has("has_debt") || filledText(f.get(k));
  const items = [filledText(f.get("purpose")), filledText(f.get("timeline")), filledText(f.get("cash_assets")), filledText(f.get("annual_income")),
    debt("existing_debt"), debt("existing_debt_annual_payment"), filledText(f.get("extra_funds")), filledText(f.get("owned_house_count"))];
  return { filled: items.filter(Boolean).length, total: items.length };
}

// 2단계: 지역·출퇴근 지역·출퇴근 시간·교육·편의시설·거주 인원·면적 7개
function stage2(f: FormData): Progress {
  const items = [f.getAll("sigungu_codes").length > 0 || filledText(f.get("dong_names")), filledText(f.get("commute_region_name")),
    filledText(f.get("commute_minutes_max")), filledText(f.get("school_importance")), filledText(f.get("infra_importance")),
    filledText(f.get("household_size")), filledText(f.get("area_min")) || filledText(f.get("area_max"))];
  return { filled: items.filter(Boolean).length, total: items.length };
}

const STAGE3_TOTAL = STAGE3_KEYS.length; // 우선순위를 고를 수 있는 조건 수

// 입력하는 대로 채워지는 진행 막대. 폼 밖(결과 패널)에서도 formId로 폼을 읽는다
export function StageProgress({ formId, stage, areaText = null }: { formId: string; stage: 1 | 2 | 3; areaText?: string | null }) {
  const [p, setP] = useState<(Progress & { must?: number }) | null>(null);
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const update = () => {
      if (stage === 3) {
        const s = readStage3(form, areaText);
        setP({ filled: s.conds.length, total: STAGE3_TOTAL, must: s.conds.filter((c) => c.priority === "must").length });
      } else setP((stage === 1 ? stage1 : stage2)(new FormData(form)));
    };
    // 첫 값은 폼 기본값에서 읽는다(외부 DOM 읽기라 렌더 중에 할 수 없어 다음 틱에 반영)
    const t = setTimeout(update, 0);
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    return () => { clearTimeout(t); form.removeEventListener("input", update); form.removeEventListener("change", update); };
  }, [formId, stage, areaText]);

  const filled = p?.filled ?? 0, total = p?.total ?? (stage === 1 ? 8 : stage === 2 ? 7 : STAGE3_TOTAL);
  const label = stage === 3 ? `조건 ${filled}개 입력${p?.must ? ` · 필수 ${p.must}개` : ""}` : `입력 진행 ${filled}/${total}`;
  return (
    <div>
      <p className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold text-chb-ink">{label}</span>
        {stage === 3 && <span className="text-xs text-chb-muted">필요한 조건만 넣어도 돼요</span>}
      </p>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={filled}
        className="mt-2 h-1.5 rounded-full bg-chb-line">
        <div className="h-full rounded-full bg-chb-accent transition-all" style={{ width: `${(filled / total) * 100}%` }} />
      </div>
    </div>
  );
}
