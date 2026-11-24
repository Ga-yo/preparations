import Link from "next/link";

const STAGES = ["예산 산정", "지역·생활", "주택 조건", "후보 탐색", "비교·결정"];

const pill = (on: boolean) =>
  `flex items-center gap-2 rounded-full py-1.5 pr-1.5 pl-1.5 text-sm font-semibold transition lg:pr-3 ${on ? "bg-chb-soft text-chb-ink" : "text-chb-muted hover:text-chb-ink"}`;
const dot = (on: boolean) => `grid size-7 place-items-center rounded-full text-xs ${on ? "bg-chb-accent text-white" : "border border-chb-line"}`;

// 채비 로고 + 5단계 탭 + 리포트. 좁은 화면에서는 이름을 숨기고 번호·아이콘만 보인다.
// 리포트는 단계가 아니라 1~5단계 결과를 모은 문서라 번호 대신 문서 아이콘을 쓰고 구분선 뒤에 둔다
export function StageTabs({ planId, current }: { planId: string; current: number | "report" }) {
  const onReport = current === "report";
  return (
    <header className="sticky top-0 z-20 border-b border-chb-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6 md:gap-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-display text-xl font-black tracking-tight">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-chb-accent" />채비
        </Link>
        <nav aria-label="단계" className="min-w-0 flex-1">
          <ol className="flex items-center justify-center gap-0.5 md:gap-1 lg:gap-1.5">
            {STAGES.map((name, i) => {
              const n = i + 1;
              const on = n === current;
              return (
                <li key={n}>
                  <Link href={`/plans/${planId}/stage/${n}`} aria-current={on ? "step" : undefined} aria-label={`${n}단계 ${name}`} className={pill(on)}>
                    <span className={dot(on)}>{n}</span>
                    <span className="hidden whitespace-nowrap lg:inline">{name}</span>
                  </Link>
                </li>
              );
            })}
            <li aria-hidden="true" className="mx-0.5 h-5 w-px bg-chb-line md:mx-1.5" />
            <li>
              <Link href={`/plans/${planId}/report`} aria-current={onReport ? "page" : undefined} aria-label="구매 검토 리포트" className={pill(onReport)}>
                <span className={dot(onReport)}>
                  <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 1.75h5.25L12.5 5v9.25H4z" />
                    <path d="M9 1.75V5.25h3.5M6.25 8.5h4M6.25 11h4" />
                  </svg>
                </span>
                <span className="hidden whitespace-nowrap lg:inline">리포트</span>
              </Link>
            </li>
          </ol>
        </nav>
      </div>
    </header>
  );
}
