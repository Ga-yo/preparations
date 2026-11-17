import Link from "next/link";

const STAGES = ["예산 산정", "지역·생활", "주택 조건", "후보 탐색", "비교·결정"];

// 채비 로고 + 5단계 탭. 좁은 화면에서는 단계 이름을 숨기고 번호만 보인다
export function StageTabs({ planId, current }: { planId: string; current: number }) {
  return (
    <header className="sticky top-0 z-20 border-b border-chb-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-display text-xl font-black tracking-tight">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-chb-accent" />채비
        </Link>
        <nav aria-label="단계" className="min-w-0 flex-1">
          <ol className="flex items-center justify-center gap-1 lg:gap-2">
            {STAGES.map((name, i) => {
              const n = i + 1;
              const on = n === current;
              return (
                <li key={n}>
                  <Link
                    href={`/plans/${planId}/stage/${n}`}
                    aria-current={on ? "step" : undefined}
                    className={`flex items-center gap-2 rounded-full py-1.5 pr-3 pl-1.5 text-sm font-semibold transition ${on ? "bg-chb-soft text-chb-ink" : "text-chb-muted hover:text-chb-ink"}`}
                  >
                    <span className={`grid size-7 place-items-center rounded-full text-xs ${on ? "bg-chb-accent text-white" : "border border-chb-line"}`}>{n}</span>
                    <span className="hidden md:inline">{name}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
    </header>
  );
}
