"use client";
import { useState } from "react";
import map from "./sigungu-map.json";

export const MAX_SIGUNGU = 10;

/** 선택 토글. 이미 MAX개면 새로 추가하지 않고 그대로 돌려준다. */
export function toggleCode(selected: string[], code: string, max = MAX_SIGUNGU): string[] {
  if (selected.includes(code)) return selected.filter((c) => c !== code);
  return selected.length >= max ? selected : [...selected, code];
}

type Row = { sigungu_code: string | null; sido: string; full_name: string };
const VIEWS = ["전체", "서울특별시", "인천광역시", "경기도"] as const;
const PATHS: Record<string, string> = map.paths;
const SIDO_BOX: Record<string, string> = map.sido;
const LABELS: Record<string, number[]> = map.labels;
const PREFIX: Record<string, string> = { 서울특별시: "11", 인천광역시: "28", 경기도: "41" };

// 지도는 마우스·터치용이라 스크린리더에서 숨기고, 같은 값을 쓰는 체크박스 목록을 아래에 접어 둔다(키보드·스크린리더용).
export function SigunguPicker({ rows, initial }: { rows: Row[]; initial: string[] }) {
  const [selected, setSelected] = useState(initial);
  const [view, setView] = useState<(typeof VIEWS)[number]>("전체");
  const [hover, setHover] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const nameOf = new Map(rows.map((r) => [r.sigungu_code ?? "", r.full_name]));
  const toggle = (code: string) =>
    setSelected((prev) => {
      const next = toggleCode(prev, code);
      setFull(next === prev && !prev.includes(code)); // 멱등이라 StrictMode 이중 호출에도 안전
      return next;
    });
  // Map.groupBy는 Safari 17.4 미만에 없어 클라이언트에서 쓰지 않는다
  const bySido = [...new Set(rows.map((r) => r.sido))].map((sido) => [sido, rows.filter((r) => r.sido === sido)] as const);
  const box = view === "전체" ? map.viewBox : SIDO_BOX[view];
  const inView = (code: string) => view === "전체" || code.startsWith(PREFIX[view]);
  const fontSize = Number(box.split(" ")[2]) / 34;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1" role="group" aria-label="지도 범위">
        {VIEWS.map((v) => (
          <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v}
            className={`rounded-full border px-3 py-1 text-sm ${view === v ? "border-chb-accent bg-chb-accent text-white" : "border-chb-line hover:border-chb-ink"}`}>
            {v === "전체" ? "수도권 전체" : v.slice(0, 2)}
          </button>
        ))}
      </div>
      <p className="min-h-5 text-sm text-chb-muted" aria-hidden="true">{hover ? nameOf.get(hover) : "지도에서 지역을 눌러 선택하세요"}</p>
      <svg viewBox={box} aria-hidden="true"
        className="w-full rounded-xl border border-chb-line bg-white in-disabled:pointer-events-none" style={{ maxHeight: 480 }}>
        {Object.entries(PATHS).map(([code, d]) => nameOf.has(code) && (
          <path key={code} d={d} onClick={() => toggle(code)}
            onMouseEnter={() => setHover(code)} onMouseLeave={() => setHover((h) => (h === code ? null : h))}
            className={`cursor-pointer stroke-chb-muted/40 transition-colors ${selected.includes(code) ? "fill-chb-accent hover:brightness-110" : "fill-chb-accent-soft hover:fill-[#b9dcc8]"} ${inView(code) ? "" : "opacity-40"}`}
            strokeWidth={1} vectorEffect="non-scaling-stroke">
            <title>{nameOf.get(code)}</title>
          </path>
        ))}
        {/* 시·도로 확대했을 때만, 이름이 들어갈 만큼 넓은 곳에만 쓴다(좁은 곳은 마우스를 올리면 위에 표시) */}
        {view !== "전체" && Object.entries(LABELS).map(([code, [x, y, w]]) => inView(code) && nameOf.has(code) && w > fontSize * 3.5 && (
          <text key={code} x={x} y={y} fontSize={fontSize} textAnchor="middle" dominantBaseline="middle" pointerEvents="none"
            className={selected.includes(code) ? "fill-white font-semibold" : "fill-chb-ink"}>
            {nameOf.get(code)!.split(" ").at(-1)}
          </text>
        ))}
      </svg>
      <p className="text-xs text-chb-muted">
        경계: 통계청 <a href="https://sgis.kostat.go.kr" target="_blank" rel="noopener noreferrer" className="underline">SGIS</a> 행정동 경계(공공누리 제1유형) 가공,{" "}
        <a href="https://github.com/vuski/admdongkor" target="_blank" rel="noopener noreferrer" className="underline">vuski/admdongkor</a> (CC BY 4.0). 백령도 등 먼 섬은 생략
      </p>
      {full && <p role="alert" className="text-sm text-red-700">최대 {MAX_SIGUNGU}곳까지 고를 수 있어요. 다른 곳을 빼고 골라 주세요.</p>}
      <ul className="flex flex-wrap gap-1" aria-label="선택한 시군구">
        {selected.map((c) => (
          <li key={c}>
            <button type="button" onClick={() => toggle(c)} aria-label={`${nameOf.get(c)} 선택 해제`}
              className="rounded-full bg-chb-accent-soft px-3 py-1 text-sm hover:bg-chb-soft">
              {nameOf.get(c)} ×
            </button>
          </li>
        ))}
      </ul>
      <details className="text-sm">
        <summary className="cursor-pointer text-chb-muted">목록에서 고르기 ({selected.length}/{MAX_SIGUNGU})</summary>
        {bySido.map(([sido, rs]) => (
          <fieldset key={sido} className="mt-2">
            <legend className="font-medium">{sido}</legend>
            <div className="grid grid-cols-2 gap-x-2 sm:grid-cols-3">
              {rs.map((s) => {
                const code = s.sigungu_code ?? "";
                const on = selected.includes(code);
                return (
                  <label key={code} className="flex items-center gap-1">
                    <input type="checkbox" name="sigungu_codes" value={code} checked={on}
                      disabled={!on && selected.length >= MAX_SIGUNGU} onChange={() => toggle(code)} />
                    {s.full_name.slice(sido.length + 1)}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </details>
    </div>
  );
}
