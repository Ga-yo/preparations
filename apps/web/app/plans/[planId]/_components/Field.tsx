// 단계 화면 공용 입력 부품(1단계 디자인). 서버 컴포넌트라 JS 없이 그려지고, 선택 상태는 CSS(has-checked)로 표시한다
export const inputClass =
  "w-full rounded-xl border border-chb-line bg-white px-4 py-3 outline-none transition focus:border-chb-accent focus:ring-4 focus:ring-chb-accent-soft";
export const labelClass = "mb-2 flex items-center gap-2 font-semibold text-chb-ink";

export function Section({ n, heading, desc, children }: { n: number; heading: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-chb-line bg-white p-6 sm:p-8">
      <div className="mb-6 flex items-start gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-chb-soft font-bold text-chb-accent">{n}</span>
        <div>
          <h2 className="font-display text-2xl font-black tracking-tight">{heading}</h2>
          <p className="mt-1 text-chb-muted">{desc}</p>
        </div>
      </div>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

export function CheckCard({ name, text, defaultChecked, value, tip }: {
  name: string; text: string; defaultChecked?: boolean; value?: string; tip?: React.ReactNode;
}) {
  return (
    <div>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-chb-line bg-white px-4 py-3 has-checked:border-chb-accent has-checked:bg-chb-soft2">
        <input name={name} type="checkbox" value={value} defaultChecked={defaultChecked} className="size-5 accent-chb-accent" /> {text}
      </label>
      {tip}
    </div>
  );
}

// 선택형 카드: 라디오를 카드 전체로 감싸 고르면 테두리·배경이 바뀐다
export function ChoiceCards({ name, legend, value, options, cols, tip }: {
  name: string; legend: string; value: string | null | undefined; options: [string, string, string?][]; cols: string; tip?: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className={labelClass}>{legend}</legend>
      <div className={`grid gap-3 ${cols}`}>
        {options.map(([v, text, desc]) => (
          <label key={v} className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-chb-line bg-white p-4 transition hover:border-chb-accent/50 has-checked:border-chb-accent has-checked:bg-chb-soft2 has-focus-visible:ring-4 has-focus-visible:ring-chb-accent-soft">
            <input type="radio" name={name} value={v} defaultChecked={value === v} className="mt-0.5 size-5 shrink-0 accent-chb-accent" />
            <span>
              <span className="block font-bold">{text}</span>
              {desc && <span className="mt-0.5 block text-sm text-chb-muted">{desc}</span>}
            </span>
          </label>
        ))}
      </div>
      {tip}
    </fieldset>
  );
}

// 1~5 점수 고르기. 양 끝에 낮음·높음
export function ScaleChoice({ name, legend, value, tip }: { name: string; legend: string; value: number | null | undefined; tip?: React.ReactNode }) {
  return (
    <fieldset>
      <legend className={labelClass}>{legend}</legend>
      <div className="flex items-center gap-2">
        <span className="text-sm text-chb-muted">낮음</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="grid size-11 cursor-pointer place-items-center rounded-full border-2 border-chb-line bg-white font-bold transition hover:border-chb-accent/50 has-checked:border-chb-accent has-checked:bg-chb-accent has-checked:text-white has-focus-visible:ring-4 has-focus-visible:ring-chb-accent-soft">
            <input type="radio" name={name} value={n} defaultChecked={value === n} className="sr-only" />{n}
          </label>
        ))}
        <span className="text-sm text-chb-muted">높음</span>
      </div>
      {tip}
    </fieldset>
  );
}

// 눌러서 켜고 끄는 칩(여러 개 선택)
export function ToggleChips({ name, legend, values, options, tip }: {
  name: string; legend: string; values: string[]; options: Record<string, string>; tip?: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className={labelClass}>{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {Object.entries(options).map(([v, text]) => (
          <label key={v} className="cursor-pointer rounded-full border-2 border-chb-line bg-white px-4 py-2 font-semibold transition hover:border-chb-accent/50 has-checked:border-chb-accent has-checked:bg-chb-soft has-checked:text-chb-accent has-focus-visible:ring-4 has-focus-visible:ring-chb-accent-soft">
            <input type="checkbox" name={name} value={v} defaultChecked={values.includes(v)} className="sr-only" />{text}
          </label>
        ))}
      </div>
      {tip}
    </fieldset>
  );
}

// 숫자 입력 + 단위 표시(분, 명, ㎡)
export function UnitInput({ id, unit, defaultValue, min, max, step = 1 }: {
  id: string; unit: string; defaultValue: number | null | undefined; min: number; max: number; step?: number;
}) {
  return (
    <div className="relative">
      <input id={id} name={id} type="number" min={min} max={max} step={step} defaultValue={defaultValue ?? ""} className={`${inputClass} pr-12 text-right tabular-nums`} />
      <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-chb-muted">{unit}</span>
    </div>
  );
}

const PRIORITY_OPTIONS = { must: "필수", prefer: "선호", ignore: "상관없음" } as const;

// 조건별 우선순위 세 칸 버튼. 저장값이 없으면 '선호'(값을 입력한 조건의 기본 의미)
export function PrioritySwitch({ name, label, value }: { name: string; label: string; value: string | undefined }) {
  return (
    <div role="radiogroup" aria-label={label} className="mt-2 inline-flex rounded-full border border-chb-line bg-chb-soft2 p-1 text-sm">
      {Object.entries(PRIORITY_OPTIONS).map(([v, text]) => (
        <label key={v} className="cursor-pointer rounded-full px-4 py-1.5 font-semibold text-chb-muted transition has-checked:bg-chb-accent has-checked:text-white has-focus-visible:ring-4 has-focus-visible:ring-chb-accent-soft">
          <input type="radio" name={name} value={v} defaultChecked={(value ?? "prefer") === v} className="sr-only" />{text}
        </label>
      ))}
    </div>
  );
}
