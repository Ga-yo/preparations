"use client";
import Link, { useLinkStatus } from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";

// <form action>은 제출 후 입력을 초기화하고, 오류 리다이렉트는 DB 값으로 다시 그려 입력이 사라진다.
// onSubmit으로 직접 호출해 검증 오류 때는 입력을 그대로 두고, 성공하면 action 안의 redirect로 새로 그린다.
// result를 넘긴 단계는 action이 redirect 대신 revalidatePath 후 []를 돌려준다. 새 화면 데이터는 액션이 끝난 뒤 1~3초 늦게
// 도착하므로, 저장마다 바뀌는 resultKey(예: updated_at)가 바뀐 것을 보고 팝업을 연다(이전 결과를 띄우지 않게).
// resultLabel이 있으면(결과가 한 번이라도 계산됐으면) 화면 아래에 결과를 다시 여는 버튼을 띄운다.
// 넓은 화면(1024px+)에서는 팝업 대신 오른쪽 결과 패널에 결과·진행 막대·저장 버튼을 두고, 패널은 접어서 입력 칸을 넓힐 수 있다.
const DESKTOP = "(min-width: 64rem)";
const subscribeDesktop = (cb: () => void) => {
  const m = window.matchMedia(DESKTOP);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

export function StageForm({
  id, title, back, labels, action, children, result, resultKey, resultLabel, next, pendingText = "저장하는 중이에요…",
  resultTitle = "결과", resultCaption = "결과 보기", wide = false, progress, submitLabel = "저장하기",
}: {
  id?: string;
  title: string;
  back?: React.ReactNode;
  labels: Record<string, string>;
  action: (form: FormData) => Promise<string[]>;
  children: React.ReactNode;
  result?: React.ReactNode;
  resultKey?: string | null;
  resultLabel?: string;
  pendingText?: string;
  resultTitle?: string; // 팝업 이름(예: "예산 계산 결과")
  resultCaption?: string; // 떠 있는 버튼의 윗줄(예: "내 예산 보기")
  next?: { href: string; label: string };
  wide?: boolean; // 결과 팝업을 넓게(두 칸 결과용, 1단계 예산). 모바일 팝업에만 쓴다
  progress?: React.ReactNode; // 입력 진행 막대(StageProgress)
  submitLabel?: string; // 저장 버튼 글자(예: "예산 계산하기")
}) {
  const [invalid, setInvalid] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  // 저장 성공 후 새 결과를 기다리는 동안 저장 시점의 resultKey를 담는다
  const [awaiting, setAwaiting] = useState<{ key: string | null | undefined } | null>(null);
  const [pending, start] = useTransition();
  const [collapsed, setCollapsed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const panelBody = useRef<HTMLDivElement>(null);
  const desktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP).matches, () => false);

  const arrived = awaiting !== null && resultKey !== awaiting.key;
  const show = !desktop && (open || arrived); // 넓은 화면은 패널에 바로 보이므로 팝업을 열지 않는다
  const waiting = pending || (awaiting !== null && !arrived && !open);
  const close = () => { setOpen(false); setAwaiting(null); };

  // 새 결과가 오면 패널을 맨 위(저장 알림·요약)부터 보여 준다
  useEffect(() => {
    if (arrived && panelBody.current) panelBody.current.scrollTop = 0;
  }, [arrived]);

  useEffect(() => {
    if (!awaiting || arrived) return;
    const t = setTimeout(() => setOpen(true), 10_000); // 키가 안 바뀌어도 언젠가는 연다
    return () => clearTimeout(t);
  }, [awaiting, arrived]);

  useEffect(() => {
    const d = dialog.current;
    if (show && !d?.open) d?.showModal();
    else if (!show && d?.open) d.close();
  }, [show]);

  // cacheComponents는 떠난 화면을 <Activity>로 숨겨 둘 뿐 없애지 않는다. 숨겨질 때 effect가 정리되므로
  // 여기서 닫지 않으면 열린 모달이 다음 화면 전체를 inert로 만들어 새로고침 전까지 클릭이 안 된다
  useEffect(() => {
    const d = dialog.current;
    return () => d?.close();
  }, []);

  return (
    <form
      id={id}
      className={`grid items-start gap-8 ${result ? (collapsed ? "lg:grid-cols-[minmax(0,1fr)_56px]" : "lg:grid-cols-[minmax(0,1fr)_420px]") : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (waiting) return; // 패널의 제출 버튼은 fieldset 밖이라 여기서 막는다
        const form = new FormData(e.currentTarget);
        setCollapsed(false); // 접어 둔 채 저장해도 새 결과가 보이게 편다
        start(async () => {
          const key = resultKey;
          const errs = await action(form);
          setInvalid(errs);
          if (!errs.length && result) setAwaiting({ key });
        });
      }}
    >
      <div className="min-w-0 space-y-6">
        {/* 진행 막대: 패널이 없을 때(모바일·패널 접힘) 단계 탭 아래에 붙어 스크롤해도 보인다. 넓은 화면은 패널 안 */}
        {progress && <div className={`sticky top-[65px] z-10 -mx-1 rounded-2xl border border-chb-line bg-white/95 px-5 py-3 backdrop-blur ${result && !collapsed ? "lg:hidden" : ""}`}>{progress}</div>}
        {back}
        <h1 className="font-display text-3xl font-black tracking-tight text-chb-ink">{title}</h1>
        {invalid.length > 0 && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">
            입력값을 확인해 주세요: {invalid.map((k) => labels[k] ?? k).join(", ")}
          </p>
        )}
        <fieldset disabled={waiting} className="space-y-8">{children}</fieldset>
        <p aria-live="polite" className="min-h-6 font-semibold text-chb-accent">{waiting ? pendingText : ""}</p>
        {/* 패널이 없을 때(모바일·패널 접힘) 쓰는 저장 버튼 */}
        <button type="submit" disabled={waiting} className={`w-full rounded-full bg-chb-accent py-4 text-lg font-bold text-white shadow-[0_16px_32px_-14px_rgba(46,125,91,0.55)] transition hover:-translate-y-0.5 disabled:cursor-progress disabled:opacity-60 ${result && !collapsed ? "lg:hidden" : ""}`}>
          {waiting ? "계산 중…" : submitLabel}
        </button>
      </div>
      {result && (collapsed ? (
        <aside aria-label={resultTitle} className="hidden lg:sticky lg:top-24 lg:block">
          <button type="button" onClick={() => setCollapsed(false)} aria-expanded={false} aria-controls={`${id}-result`} aria-label={`${resultTitle} 펼치기`}
            className="flex w-14 flex-col items-center gap-3 rounded-3xl border border-chb-line bg-white py-5 font-semibold text-chb-ink transition hover:border-chb-accent">
            <span aria-hidden="true" className="text-lg text-chb-accent">‹</span>
            <span aria-hidden="true" className="[writing-mode:vertical-rl] tracking-widest">결과 열기</span>
          </button>
        </aside>
      ) : (
        <aside id={`${id}-result`} aria-label={resultTitle}
          className="hidden flex-col overflow-hidden rounded-3xl border border-chb-line bg-white lg:sticky lg:top-24 lg:flex lg:max-h-[calc(100vh-12rem)]">
          <div className="shrink-0 space-y-4 border-b border-chb-line px-6 pt-5 pb-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-xl font-black tracking-tight">{resultTitle}</h2>
              <button type="button" onClick={() => setCollapsed(true)} aria-expanded aria-controls={`${id}-result`} aria-label={`${resultTitle} 접기`}
                className="grid size-9 place-items-center rounded-full text-lg text-chb-muted hover:bg-chb-soft2 hover:text-chb-ink">›</button>
            </div>
            {progress}
          </div>
          <div ref={panelBody} className="@container min-h-0 flex-1 overflow-y-auto">
            {waiting ? (
              <p role="status" className="flex items-center gap-3 p-6 font-semibold text-chb-accent">
                <span aria-hidden="true" className="size-5 animate-spin rounded-full border-2 border-chb-accent/30 border-t-chb-accent" />{pendingText}
              </p>
            ) : resultLabel ? (
              <>
                {arrived && <p role="status" className="mx-6 mt-5 rounded-xl bg-chb-soft px-4 py-3 font-semibold text-chb-accent">✓ 저장했어요. 새 {resultTitle}예요</p>}
                <div className="px-2">{result}</div>
              </>
            ) : (
              <p className="p-6 leading-relaxed text-chb-muted">왼쪽을 입력하고 아래 &lsquo;{submitLabel}&rsquo; 버튼을 누르면 {resultTitle}가 여기 보여요.</p>
            )}
          </div>
          <div className="shrink-0 space-y-2 border-t border-chb-line p-4">
            <button type="submit" disabled={waiting}
              className="w-full rounded-full bg-chb-accent py-3.5 text-lg font-bold text-white shadow-[0_16px_32px_-14px_rgba(46,125,91,0.55)] transition hover:-translate-y-0.5 disabled:cursor-progress disabled:opacity-60">
              {waiting ? "계산 중…" : submitLabel}
            </button>
            {next && resultLabel && !waiting && (
              <Link href={next.href} className="block w-full rounded-full border border-chb-line py-3 text-center font-semibold hover:border-chb-ink"><NextLabel label={next.label} dark /></Link>
            )}
          </div>
        </aside>
      ))}
      {result && (
        // Esc는 dialog가 처리하고 close 이벤트로 상태를 맞춘다. 바깥(backdrop) 클릭은 dialog 자신이 target일 때다
        <dialog
          ref={dialog}
          aria-label={resultTitle}
          onClose={close}
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
          className={`m-auto max-h-[85vh] ${wide ? "w-[min(960px,calc(100%-32px))]" : "w-[min(560px,calc(100%-32px))]"} overflow-auto rounded-3xl bg-white p-0 text-chb-ink shadow-2xl backdrop:bg-chb-ink/40 backdrop:backdrop-blur-sm`}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-chb-line bg-white px-6 py-4">
            <p className="flex items-center gap-2 font-semibold"><span aria-hidden="true" className="text-chb-accent">✓</span>저장했어요. {resultTitle}입니다</p>
            <button type="button" onClick={close} aria-label="닫기" className="rounded-full px-2 text-xl text-chb-muted hover:text-chb-ink">×</button>
          </div>
          <div className="@container px-2">{result}</div>
          <div className="sticky bottom-0 flex justify-end gap-3 border-t border-chb-line bg-white px-6 py-4">
            <button type="button" onClick={close} className="rounded-full border border-chb-line px-5 py-2.5 font-semibold hover:border-chb-ink">닫기</button>
            {next && (
              <Link href={next.href} className="rounded-full bg-chb-accent px-5 py-2.5 font-semibold text-white hover:brightness-110"><NextLabel label={next.label} /></Link>
            )}
          </div>
        </dialog>
      )}
      {result && (resultLabel || waiting) && (
        <button
          type="button" onClick={() => setOpen(true)} disabled={waiting}
          className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-5 lg:hidden whitespace-nowrap rounded-full bg-chb-ink py-2.5 pr-2.5 pl-7 text-left text-white shadow-[0_18px_40px_-12px_rgba(20,32,26,0.55)] transition hover:-translate-y-0.5 disabled:cursor-progress"
        >
          <span>
            <span className="block text-xs text-white/70">{waiting ? "잠시만요" : resultCaption}</span>
            <span className="block text-lg font-bold">{waiting ? "계산 중…" : resultLabel}</span>
          </span>
          <span aria-hidden="true" className="grid size-11 place-items-center rounded-full bg-white/15 text-lg">{waiting ? "…" : "⌃"}</span>
        </button>
      )}
    </form>
  );
}

// useLinkStatus는 Link 안에서만 쓸 수 있어 따로 둔다. 다음 단계 화면을 받는 동안 스피너를 보여 준다
function NextLabel({ label, dark = false }: { label: string; dark?: boolean }) {
  const { pending } = useLinkStatus();
  return pending ? (
    <span role="status" className="flex items-center justify-center gap-2">
      <span aria-hidden="true" className={`size-4 animate-spin rounded-full border-2 ${dark ? "border-chb-ink/30 border-t-chb-ink" : "border-white/40 border-t-white"}`} />
      이동하는 중…
    </span>
  ) : label;
}
