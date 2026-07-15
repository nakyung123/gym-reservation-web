"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { updateMyPasswordDirect } from "@/lib/firebase-password-update";
import {
  PASSWORD_POLICY_HINT,
  validatePasswordPolicy,
} from "@/lib/password-policy";
import { AlertModal } from "@/components/ui/alert-modal";
import { FieldLabel, INPUT_CLASS } from "./account-fields";

// 비밀번호 입력칸: 마스킹 문자 간격을 띄운다(자간). 플레이스홀더는 기본 자간 유지.
const PW_INPUT_CLASS = `${INPUT_CLASS} tracking-[0.2em] placeholder:tracking-normal`;

/**
 * 회원정보 폼 안의 인라인 비밀번호 변경(새 비번 + 확인 + 변경 버튼).
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
  // 변경 버튼은 항상 활성(네이비)이라, 미입력·정책위반·불일치는 알림창으로 안내한다.
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  // 파생값: 정책 위반·불일치 메시지는 상태로 들지 않고 입력값에서 계산한다.
  const policyError =
    newPassword.length > 0 ? validatePasswordPolicy(newPassword) : null;
  const mismatch =
    confirm.length > 0 && confirm !== newPassword ? t("pwMismatch") : null;

  // 미완료 항목을 위에서부터 찾아 첫 안내 문구를 돌려준다(변경 버튼 클릭 시 알림창용).
  const firstInvalidMessage = (): string | null => {
    if (newPassword.length === 0) return "새 비밀번호를 입력해주세요.";
    if (policyError) return policyError;
    if (confirm.length === 0) return "비밀번호 확인을 입력해주세요.";
    if (mismatch) return mismatch;
    return null;
  };

  const handleChange = async () => {
    if (state.kind === "loading" || disabled) return;
    const invalid = firstInvalidMessage();
    if (invalid) {
      setAlertMessage(invalid);
      return;
    }
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
    <div>
      <div className="flex flex-col gap-4">
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
            className={`${PW_INPUT_CLASS} ${policyError ? "border-error" : ""}`}
          />
          <p
            className={`text-[16px] ${policyError ? "font-semibold text-error" : "text-slate-500"}`}
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
            className={`${PW_INPUT_CLASS} ${mismatch ? "border-error" : ""}`}
          />
          {mismatch ? (
            <p className="text-[16px] font-semibold text-error" role="alert">
              {mismatch}
            </p>
          ) : null}
        </div>

        {state.kind === "success" ? (
          <p
            className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-[16px] font-semibold text-success"
            role="status"
          >
            {t("pwSuccess")}
          </p>
        ) : null}
        {state.kind === "error" ? (
          <p
            className="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-[16px] text-error"
            role="alert"
          >
            {state.message}
          </p>
        ) : null}
      </div>

      {/* 변경 버튼: 위 간격 28px, 항상 네이비(radius 30), 미완료는 알림창으로 안내 */}
      <div className="mt-[28px] flex justify-end">
        <button
          type="button"
          onClick={handleChange}
          disabled={disabled || state.kind === "loading"}
          className="inline-flex h-[48px] w-[134.88px] items-center justify-center rounded-[30px] bg-accent text-center text-[16px] font-semibold text-white transition hover:bg-accent-hover disabled:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          {state.kind === "loading" ? t("saving") : t("pwChangeButton")}
        </button>
      </div>

      {alertMessage ? (
        <AlertModal
          message={alertMessage}
          onClose={() => setAlertMessage(null)}
        />
      ) : null}
    </div>
  );
}
