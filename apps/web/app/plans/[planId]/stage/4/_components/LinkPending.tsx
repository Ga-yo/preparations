"use client";
import { useLinkStatus } from "next/link";

// useLinkStatus는 Link 안에서만 쓸 수 있다. 상세를 받는 동안 누른 단지에 바로 표시한다
export function LinkPending() {
  const { pending } = useLinkStatus();
  return pending ? (
    <span role="status" className="mt-1 flex items-center gap-1.5 text-xs text-chb-accent">
      <span aria-hidden="true" className="size-3 animate-spin rounded-full border-2 border-chb-accent/30 border-t-chb-accent" />
      불러오는 중…
    </span>
  ) : null;
}
