"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { reauthenticateMyPassword } from "@/lib/firebase-password-update";
import { AlertModal } from "@/components/ui/alert-modal";

/**
 * 회원정보변경 진입 게이트(본인 확인). 비밀번호 회원에게만 노출된다.
 * 비밀번호 재인증에 성공하면 onUnlock으로 부모가 폼을 연다.
 * 재인증 시한이 지나 requires-recent-login이 발생하면 부모가 다시 이 게이트를 잠근다.
 */
export function AccountGate({ onUnlock }: { onUnlock: () => void }) {
  const t = useTranslations("Mypage");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "checking" } | { kind: "error"; message: string }
  >({ kind: "idle" });
  // 확인 버튼은 항상 활성(네이비)이라, 빈 입력이면 알림창으로 안내한다.
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (state.kind === "checking") return;
    if (password.length === 0) {
      setAlertMessage("비밀번호를 입력해주세요.");
      return;
    }
    setState({ kind: "checking" });
    const result = await reauthenticateMyPassword(password);
    if (result.ok) {
      onUnlock();
      return;
    }
    setState({ kind: "error", message: result.message });
  };

  return (
    <section className="mx-auto w-[800px] max-w-full">
      {/* 본인 확인 박스: 800×305, padding 60, 테두리 없이 옅은 회색 배경 */}
      <div className="flex min-h-[305px] flex-col rounded-2xl bg-surface-2 p-[60px]">
        <h2 className="text-[22px] font-bold text-slate-950">{t("gateTitle")}</h2>
        <form
          className="mt-8 flex flex-1 flex-col"
          onSubmit={handleSubmit}
          noValidate
        >
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
            className={`h-[56px] w-full rounded-md border bg-white px-4 text-[16px] tracking-[0.2em] text-slate-950 placeholder:tracking-normal placeholder:text-slate-400 focus:outline-none disabled:bg-slate-100 ${
              state.kind === "error"
                ? "border-error focus:border-error"
                : "border-line-strong focus:border-[#111]"
            }`}
          />
          {state.kind === "error" ? (
            <p className="mt-2 text-[16px] font-semibold text-error" role="alert">
              {state.message}
            </p>
          ) : null}
          <div className="mt-8 flex justify-center">
            <button
              type="submit"
              disabled={state.kind === "checking"}
              className="inline-flex h-[60px] w-[160px] items-center justify-center rounded-[30px] bg-accent text-[18px] font-bold text-accent-ink transition hover:bg-accent-hover disabled:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              {state.kind === "checking" ? t("gateChecking") : t("gateConfirm")}
            </button>
          </div>
        </form>
      </div>

      {alertMessage ? (
        <AlertModal
          message={alertMessage}
          onClose={() => setAlertMessage(null)}
        />
      ) : null}
    </section>
  );
}
