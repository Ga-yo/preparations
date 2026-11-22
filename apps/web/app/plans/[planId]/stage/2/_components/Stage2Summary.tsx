"use client";
import { useEffect, useState } from "react";

export type Stage2Snapshot = {
  sigungu: string[]; dong: string; commuteRegion: string; commuteMin: number | null; transit: boolean;
  school: number | null; infra: number | null; household: number | null; areaMin: number | null; areaMax: number | null;
  parking: boolean; env: string[];
};
const ENV: Record<string, string> = { quiet: "조용한 환경", near_commercial: "상권 인접", near_park: "공원 인접" };
const TOTAL = 7;

const num = (v: FormDataEntryValue | null) => (String(v ?? "").trim() ? Number(v) : null);
function read(form: HTMLFormElement): Stage2Snapshot {
  const f = new FormData(form);
  return {
    sigungu: f.getAll("sigungu_codes").map(String), dong: String(f.get("dong_names") ?? ""),
    commuteRegion: String(f.get("commute_region_name") ?? "").trim(), commuteMin: num(f.get("commute_minutes_max")),
    transit: f.has("uses_transit"), school: num(f.get("school_importance")), infra: num(f.get("infra_importance")),
    household: num(f.get("household_size")), areaMin: num(f.get("area_min")), areaMax: num(f.get("area_max")),
    parking: f.has("parking_required"), env: f.getAll("environment_prefs").map(String),
  };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-chb-line py-4">
      <p className="text-sm text-chb-muted">{label}</p>
      <div className="mt-1 font-semibold">{children}</div>
    </div>
  );
}
const Empty = () => <span className="font-normal text-chb-muted">아직 입력 전이에요</span>;

// 입력하는 대로 바뀌는 2단계 요약. names: 시군구 코드 → 표시 이름
export function Stage2Summary({ formId, initial, names }: { formId: string; initial: Stage2Snapshot; names: Record<string, string> }) {
  const [s, setS] = useState(initial);
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const update = () => setS(read(form));
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    return () => { form.removeEventListener("input", update); form.removeEventListener("change", update); };
  }, [formId]);

  const dongs = s.dong.split(",").map((x) => x.trim()).filter(Boolean);
  const regions = [...s.sigungu.map((c) => names[c] ?? c), ...dongs];
  const filled = [regions.length > 0, !!s.commuteRegion, s.commuteMin !== null, s.school !== null, s.infra !== null,
    s.household !== null, s.areaMin !== null || s.areaMax !== null].filter(Boolean).length;
  const commute = [s.commuteRegion, s.commuteMin !== null && `${s.commuteMin}분 이내`, s.transit && "대중교통"].filter(Boolean);
  const living = [s.household !== null && `${s.household}명`,
    (s.areaMin !== null || s.areaMax !== null) && `전용 ${s.areaMin ?? ""}~${s.areaMax ?? ""}㎡`, s.parking && "주차 필요"].filter(Boolean);

  return (
    <section aria-label="입력 요약" className="rounded-3xl border border-chb-line bg-white p-6">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl font-black tracking-tight">입력 요약</h2>
        <p className="text-sm text-chb-muted">입력 진행 {filled}/{TOTAL}</p>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-chb-line" aria-hidden="true">
        <div className="h-full rounded-full bg-chb-accent transition-all" style={{ width: `${(filled / TOTAL) * 100}%` }} />
      </div>

      <div className="mt-2">
        <Row label={`고른 지역${regions.length ? ` ${regions.length}곳` : ""}`}>
          {regions.length ? (
            <ul className="mt-1 flex flex-wrap gap-2">
              {regions.map((r) => <li key={r} className="rounded-full bg-chb-soft px-3 py-1 text-sm text-chb-accent">{r}</li>)}
            </ul>
          ) : <Empty />}
        </Row>
        <Row label="출퇴근">{commute.length ? commute.join(" · ") : <Empty />}</Row>
        <Row label="중요도">
          {s.school === null && s.infra === null ? <Empty /> : `교육 ${s.school ?? "-"}/5 · 편의시설 ${s.infra ?? "-"}/5`}
        </Row>
        <Row label="거주">{living.length ? living.join(" · ") : <Empty />}</Row>
      </div>
      {s.env.length > 0 && (
        <ul className="flex flex-wrap gap-2 pt-4" aria-label="선호 환경">
          {s.env.map((e) => <li key={e} className="rounded-full bg-chb-soft px-3 py-1.5 text-sm font-semibold text-chb-accent">{ENV[e] ?? e}</li>)}
        </ul>
      )}

      <button type="submit" form={formId} className="mt-6 w-full rounded-full bg-chb-accent py-4 text-lg font-bold text-white shadow-[0_16px_32px_-14px_rgba(46,125,91,0.55)] transition hover:-translate-y-0.5">
        저장하고 시세 보기
      </button>
    </section>
  );
}
