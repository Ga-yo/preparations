"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

// <form action>은 제출 후 입력을 초기화하고, 오류 리다이렉트는 DB 값으로 다시 그려 입력이 사라진다.
// onSubmit으로 직접 호출해 검증 오류 때는 입력을 그대로 두고, 성공하면 action 안의 redirect로 새로 그린다.
// result를 넘긴 단계는 action이 redirect 대신 revalidatePath 후 []를 돌려준다. 새 화면 데이터는 액션이 끝난 뒤 1~3초 늦게
// 도착하므로, 저장마다 바뀌는 resultKey(예: updated_at)가 바뀐 것을 보고 팝업을 연다(이전 결과를 띄우지 않게).
// resultLabel이 있으면(결과가 한 번이라도 계산됐으면) 화면 아래에 결과를 다시 여는 버튼을 띄운다.
export function StageForm({
  id, title, back, labels, action, children, result, resultKey, resultLabel, next,
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
  next?: { href: string; label: string };
}) {
  const [invalid, setInvalid] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  // 저장 성공 후 새 결과를 기다리는 동안 저장 시점의 resultKey를 담는다
  const [awaiting, setAwaiting] = useState<{ key: string | null | undefined } | null>(null);
  const [pending, start] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);

  const arrived = awaiting !== null && resultKey !== awaiting.key;
  const show = open || arrived;
  const waiting = pending || (awaiting !== null && !show);
  const close = () => { setOpen(false); setAwaiting(null); };

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

  return (
    <form
      id={id}
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (waiting) return; // 폼 밖 제출 버튼은 fieldset으로 막히지 않는다
        const form = new FormData(e.currentTarget);
        start(async () => {
          const key = resultKey;
          const errs = await action(form);
          setInvalid(errs);
          if (!errs.length && result) setAwaiting({ key });
        });
      }}
    >
      {back}
      <h1 className="font-display text-3xl font-black tracking-tight text-chb-ink">{title}</h1>
      {invalid.length > 0 && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">
          입력값을 확인해 주세요: {invalid.map((k) => labels[k] ?? k).join(", ")}
        </p>
      )}
      <fieldset disabled={waiting} className="space-y-8">{children}</fieldset>
      <p aria-live="polite" className="min-h-6 font-semibold text-chb-accent">{waiting ? "저장하고 예산을 계산하는 중이에요…" : ""}</p>
      {result && (
        // Esc는 dialog가 처리하고 close 이벤트로 상태를 맞춘다. 바깥(backdrop) 클릭은 dialog 자신이 target일 때다
        <dialog
          ref={dialog}
          aria-label="예산 계산 결과"
          onClose={close}
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
          className="m-auto max-h-[85vh] w-[min(560px,calc(100%-32px))] overflow-auto rounded-3xl bg-white p-0 text-chb-ink shadow-2xl backdrop:bg-chb-ink/40 backdrop:backdrop-blur-sm"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-chb-line bg-white px-6 py-4">
            <p className="flex items-center gap-2 font-semibold"><span aria-hidden="true" className="text-chb-accent">✓</span>저장했어요. 예산 계산 결과입니다</p>
            <button type="button" onClick={close} aria-label="닫기" className="rounded-full px-2 text-xl text-chb-muted hover:text-chb-ink">×</button>
          </div>
          <div className="px-2">{result}</div>
          <div className="sticky bottom-0 flex justify-end gap-3 border-t border-chb-line bg-white px-6 py-4">
            <button type="button" onClick={close} className="rounded-full border border-chb-line px-5 py-2.5 font-semibold hover:border-chb-ink">닫기</button>
            {next && (
              <Link href={next.href} className="rounded-full bg-chb-accent px-5 py-2.5 font-semibold text-white hover:brightness-110">{next.label}</Link>
            )}
          </div>
        </dialog>
      )}
      {result && (resultLabel || waiting) && (
        <button
          type="button" onClick={() => setOpen(true)} disabled={waiting}
          className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-5 whitespace-nowrap rounded-full bg-chb-ink py-2.5 pr-2.5 pl-7 text-left text-white shadow-[0_18px_40px_-12px_rgba(20,32,26,0.55)] transition hover:-translate-y-0.5 disabled:cursor-progress"
        >
          <span>
            <span className="block text-xs text-white/70">{waiting ? "잠시만요" : "내 예산 보기"}</span>
            <span className="block text-lg font-bold">{waiting ? "예산 계산 중…" : resultLabel}</span>
          </span>
          <span aria-hidden="true" className="grid size-11 place-items-center rounded-full bg-white/15 text-lg">{waiting ? "…" : "⌃"}</span>
        </button>
      )}
    </form>
  );
}
