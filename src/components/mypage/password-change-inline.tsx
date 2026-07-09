"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { updateMyPasswordDirect } from "@/lib/firebase-password-update";
import {
  PASSWORD_POLICY_HINT,
  validatePasswordPolicy,
} from "@/lib/password-policy";
import { FieldLabel, INPUT_CLASS } from "./account-fields";

/**
 * KMI 폼 안의 인라인 비밀번호 변경(새 비번 + 확인 + 변경 버튼).
 *
 * 게이트(AccountGate)에서 이미 재인증을 마쳤으므로 현재 비번을 다시 받지 않는다.
 * 재인증 시한이 지나 requires-recent-login이면 onRelock으로 게이트를 다시 잠가
 * 본인 확인을 재요청한다.
 */
export function PasswordChangeInline({
  onRelock,
  disabled,
}: {
  onRelock: () => void;
  /** 부모 폼 저장 중이면 함께 비활성화한다. */
  disabled: boolean;
}) {
  const t = useTranslations("Mypage");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "success" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  // 파생값: 정책 위반·불일치 메시지는 상태로 들지 않고 입력값에서 계산한다.
  const policyError =
    newPassword.length > 0 ? validatePasswordPolicy(newPassword) : null;
  const mismatch =
    confirm.length > 0 && confirm !== newPassword ? t("pwMismatch") : null;
  const canSubmit =
    newPassword.length > 0 &&
    confirm.length > 0 &&
    !policyError &&
    !mismatch &&
    state.kind !== "loading";

  const handleChange = async () => {
    if (!canSubmit) return;
    setState({ kind: "loading" });
    const result = await updateMyPasswordDirect(newPassword);
    if (result.ok) {
      setState({ kind: "success" });
      setNewPassword("");
      setConfirm("");
      return;
    }
    if (result.reason === "requires-recent-login") {
      // 재인증 시한 만료: 게이트를 다시 잠가 본인 확인을 재요청한다.
      onRelock();
      return;
    }
    setState({ kind: "error", message: result.message });
  };

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-5">
      <div className="flex flex-col gap-2">
        <FieldLabel htmlFor="account-new-password" required>
          {t("pwNewLabel")}
        </FieldLabel>
        <input
          id="account-new-password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => {
            setNewPassword(e.target.value);
            if (state.kind !== "idle") setState({ kind: "idle" });
          }}
          placeholder={t("pwNewLabel")}
          disabled={disabled}
          aria-invalid={Boolean(policyError) || undefined}
          className={`${INPUT_CLASS} ${policyError ? "border-error focus-visible:ring-error/30" : ""}`}
        />
        <p
          className={`text-xs ${policyError ? "font-semibold text-error" : "text-slate-500"}`}
        >
          {policyError ?? PASSWORD_POLICY_HINT}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <FieldLabel htmlFor="account-confirm-password" required>
          {t("pwConfirmLabel")}
        </FieldLabel>
        <input
          id="account-confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            if (state.kind !== "idle") setState({ kind: "idle" });
          }}
          placeholder={t("pwConfirmLabel")}
          disabled={disabled}
          aria-invalid={Boolean(mismatch) || undefined}
          className={`${INPUT_CLASS} ${mismatch ? "border-error focus-visible:ring-error/30" : ""}`}
        />
        {mismatch ? (
          <p className="text-xs font-semibold text-error" role="alert">
            {mismatch}
          </p>
        ) : null}
      </div>

      {state.kind === "success" ? (
        <p
          className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm font-semibold text-success"
          role="status"
        >
          {t("pwSuccess")}
        </p>
      ) : null}
      {state.kind === "error" ? (
        <p
          className="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-sm text-error"
          role="alert"
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleChange}
          disabled={!canSubmit || disabled}
          className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          {state.kind === "loading" ? t("saving") : t("pwChangeButton")}
        </button>
      </div>
    </div>
  );
}
