"use client";
import { useEffect, useState } from "react";
import { formatWon } from "../../../_components/format";

// 우선순위를 고를 수 있는 조건과 그 값을 읽어 오는 입력칸. area는 2단계 값이라 폼에 없다
const KEYS: { key: string; field?: string; text: (v: number) => string }[] = [
  { key: "price_max", text: (v) => `최고가 ${formatWon(v * 10_000)} 이하` },
  { key: "area", text: () => "" },
  { key: "approval_year_min", text: (v) => `${v}년 이후 준공` },
  { key: "household_count_min", text: (v) => `${v.toLocaleString("ko-KR")}세대 이상` },
  { key: "parking_per_household_min", text: (v) => `세대당 주차 ${v}대 이상` },
  { key: "floor_area_ratio_max", text: (v) => `용적률 ${v}% 이하` },
  { key: "station_distance_max", field: "station_distance_max_m", text: (v) => `역 ${v.toLocaleString("ko-KR")}m 이내` },
  { key: "elementary_distance_max", field: "elementary_distance_max_m", text: (v) => `초등학교 ${v.toLocaleString("ko-KR")}m 이내` },
];
const TYPES: Record<string, string> = { apartment: "아파트", officetel: "오피스텔", row_house: "연립·다세대" };
const FLOORS: Record<string, string> = { low: "저층", mid: "중층", high: "고층" };
const DIRECTIONS: Record<string, string> = { east: "동향", west: "서향", south: "남향", north: "북향" };

type Cond = { text: string; priority: string };
export type Stage3Snapshot = { conds: Cond[]; basics: string[] };

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").replace(/,/g, "").trim();
  return s ? Number(s) : null;
};
// areaText: 2단계에서 정한 면적(없으면 null). 값이 있는 조건만 센다(저장할 때도 값 없는 조건의 우선순위는 버린다)
export function readStage3(form: HTMLFormElement, areaText: string | null): Stage3Snapshot {
  const f = new FormData(form);
  const conds: Cond[] = [];
  for (const k of KEYS) {
    const priority = String(f.get(`priority.${k.key}`) ?? "prefer");
    if (k.key === "area") { if (areaText) conds.push({ text: areaText, priority }); continue; }
    const v = num(f.get(k.field ?? k.key));
    if (v !== null) conds.push({ text: k.text(v), priority });
  }
  const rooms = num(f.get("rooms_min")), baths = num(f.get("baths_min"));
  const basics = [
    ...f.getAll("housing_types").map((t) => TYPES[String(t)] ?? String(t)),
    rooms !== null && `방 ${rooms}개 이상`, baths !== null && `욕실 ${baths}개 이상`,
    FLOORS[String(f.get("floor_pref") ?? "")], DIRECTIONS[String(f.get("direction_pref") ?? "")],
    f.has("redevelopment_interest") && "재건축·재개발 관심",
  ].filter(Boolean) as string[];
  return { conds, basics };
}

function Chips({ items, tone }: { items: string[]; tone: "must" | "prefer" | "basic" }) {
  const cls = tone === "must" ? "bg-chb-accent text-white" : tone === "prefer" ? "bg-chb-soft text-chb-accent" : "bg-chb-soft2 text-chb-ink";
  return <ul className="mt-2 flex flex-wrap gap-2">{items.map((t) => <li key={t} className={`rounded-full px-3 py-1 text-sm font-semibold ${cls}`}>{t}</li>)}</ul>;
}

export function Stage3Summary({ formId, areaText }: { formId: string; areaText: string | null }) {
  const [s, setS] = useState<Stage3Snapshot | null>(null);
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const update = () => setS(readStage3(form, areaText));
    // 첫 값은 폼의 기본값에서 읽는다(외부 DOM 읽기라 렌더 중에 할 수 없어 다음 틱에 반영)
    const t = setTimeout(update, 0);
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    return () => { clearTimeout(t); form.removeEventListener("input", update); form.removeEventListener("change", update); };
  }, [formId, areaText]);

  const conds = s?.conds ?? [];
  const by = (p: string) => conds.filter((c) => c.priority === p).map((c) => c.text);
  const must = by("must"), prefer = by("prefer"), ignore = by("ignore");
  const total = Math.max(conds.length, 1);

  return (
    <section aria-label="입력 요약" className="rounded-3xl border border-chb-line bg-white p-6">
      <h2 className="font-display text-xl font-black tracking-tight">입력 요약</h2>
      <p className="mt-1 text-sm text-chb-muted">
        필수 {must.length}개 · 선호 {prefer.length}개 · 상관없음 {ignore.length}개
      </p>
      <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-chb-line" aria-hidden="true">
        <div className="bg-chb-accent transition-all" style={{ width: `${(must.length / total) * 100}%` }} />
        <div className="bg-chb-accent/35 transition-all" style={{ width: `${(prefer.length / total) * 100}%` }} />
      </div>

      <div className="mt-2">
        <div className="border-b border-chb-line py-4">
          <p className="text-sm text-chb-muted">필수 조건 <span className="text-xs">모두 맞는 단지만 후보가 돼요</span></p>
          {must.length ? <Chips items={must} tone="must" /> : <p className="mt-1 text-chb-muted">아직 없어요</p>}
        </div>
        <div className="border-b border-chb-line py-4">
          <p className="text-sm text-chb-muted">선호 조건 <span className="text-xs">맞을수록 앞에 보여요</span></p>
          {prefer.length ? <Chips items={prefer} tone="prefer" /> : <p className="mt-1 text-chb-muted">아직 없어요</p>}
        </div>
        {!!s?.basics.length && (
          <div className="border-b border-chb-line py-4">
            <p className="text-sm text-chb-muted">기본 조건</p>
            <Chips items={s.basics} tone="basic" />
          </div>
        )}
      </div>

      <button type="submit" form={formId} className="mt-6 w-full rounded-full bg-chb-accent py-4 text-lg font-bold text-white shadow-[0_16px_32px_-14px_rgba(46,125,91,0.55)] transition hover:-translate-y-0.5">
        저장하고 조건 점검
      </button>
    </section>
  );
}
