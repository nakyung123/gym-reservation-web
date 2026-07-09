"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { reauthenticateMyPassword } from "@/lib/firebase-password-update";

/**
 * 회원정보변경 진입 게이트(KMI: 본인 확인). 비밀번호 회원에게만 노출된다.
 * 비밀번호 재인증에 성공하면 onUnlock으로 부모가 폼을 연다.
 * 재인증 시한이 지나 requires-recent-login이 발생하면 부모가 다시 이 게이트를 잠근다.
 */
export function AccountGate({ onUnlock }: { onUnlock: () => void }) {
  const t = useTranslations("Mypage");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "checking" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length === 0 || state.kind === "checking") return;
    setState({ kind: "checking" });
    const result = await reauthenticateMyPassword(password);
    if (result.ok) {
      onUnlock();
      return;
    }
    setState({ kind: "error", message: result.message });
  };

  return (
    <section className="mx-auto w-full max-w-xl rounded-2xl border border-line bg-surface-2/40 px-6 py-12 sm:px-12 sm:py-14">
      <h2 className="text-[20px] font-bold text-slate-950">{t("gateTitle")}</h2>
      <form className="mt-6 flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            // 새로 입력하기 시작하면 이전 실패 메시지를 지운다.
            if (state.kind === "error") setState({ kind: "idle" });
          }}
          placeholder={t("gatePlaceholder")}
          disabled={state.kind === "checking"}
          aria-invalid={state.kind === "error" || undefined}
          className={`h-12 w-full rounded-xl border bg-white px-4 text-[15px] text-slate-950 placeholder:text-subtle focus-visible:outline-none focus-visible:ring-2 disabled:bg-slate-100 ${
            state.kind === "error"
              ? "border-error focus-visible:ring-error/30"
              : "border-line-strong focus-visible:ring-accent"
          }`}
        />
        {state.kind === "error" ? (
          <p className="text-sm font-semibold text-error" role="alert">
            {state.message}
          </p>
        ) : null}
        <div className="mt-2 flex justify-center">
          <button
            type="submit"
            disabled={password.length === 0 || state.kind === "checking"}
            className="inline-flex h-12 min-w-40 items-center justify-center rounded-full bg-accent px-8 text-[16px] font-bold text-accent-ink transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            {state.kind === "checking" ? t("gateChecking") : t("gateConfirm")}
          </button>
        </div>
      </form>
    </section>
  );
}
