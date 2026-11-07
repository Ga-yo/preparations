"use client";
import { useState, useTransition } from "react";

// <form action>은 제출 후 입력을 초기화하고, 오류 리다이렉트는 DB 값으로 다시 그려 입력이 사라진다.
// onSubmit으로 직접 호출해 검증 오류 때는 입력을 그대로 두고, 성공하면 action 안의 redirect로 새로 그린다.
export function StageForm({
  title, back, labels, action, children,
}: {
  title: string;
  back?: React.ReactNode;
  labels: Record<string, string>;
  action: (form: FormData) => Promise<string[]>;
  children: React.ReactNode;
}) {
  const [invalid, setInvalid] = useState<string[]>([]);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        start(async () => setInvalid(await action(form)));
      }}
    >
      {back}
      <h1 className="text-xl font-semibold">{title}</h1>
      {invalid.length > 0 && (
        <p role="alert" className="rounded bg-red-100 p-2 text-red-800">
          입력값을 확인해 주세요: {invalid.map((k) => labels[k] ?? k).join(", ")}
        </p>
      )}
      <fieldset disabled={pending} className="space-y-4">{children}</fieldset>
    </form>
  );
}
