"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Modal, ModalActions } from "@/components/ui/modal";
import { getFirebaseClient } from "@/lib/firebase-client";
import { reauthenticateMyPassword } from "@/lib/firebase-password-update";
import { withdrawAccount } from "@/lib/withdrawal-client";
import { FieldLabel, INPUT_CLASS } from "./account-fields";

// 탈퇴 모달은 사유 카테고리를 노출하지 않으므로(=KMI 모달) 기본값으로 저장한다.
const DEFAULT_WITHDRAW_CATEGORY = "기타" as const;

/**
 * 회원탈퇴 모달(KMI: [필수] 동의 체크 + 비밀번호 → 회원탈퇴).
 *
 * - 비번 회원은 비밀번호 재인증, 소셜 회원은 동의만으로 진행한다.
 * - 백엔드의 부분 실패는 성공처럼 숨기지 않고 상태별 화면으로 보존한다:
 *   · active-reservation  : 진행 중 예약이 있어 탈퇴 불가 → 예약내역 이동 안내
 *   · auth-delete-failed  : DB 처리 후 Auth 삭제 실패 → 재시도 버튼(멱등 재시도 경로)
 */
export function WithdrawModal({
  isPasswordProvider,
  onClose,
}: {
  isPasswordProvider: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("Mypage");
  const tW = useTranslations("Withdraw");
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [password, setPassword] = useState("");
  const [state, setState] = useState<
    | { kind: "form" }
    | { kind: "submitting" }
    | { kind: "success" }
    | { kind: "active-reservation"; message: string }
    | { kind: "auth-delete-failed"; message: string }
    | { kind: "error"; message: string }
  >({ kind: "form" });

  const canSubmit =
    agreed &&
    (!isPasswordProvider || password.length > 0) &&
    state.kind === "form";

  // 탈퇴 본체. auth-delete-failed 재시도 버튼에서도 그대로 다시 호출한다(멱등).
  const runWithdraw = async () => {
    setState({ kind: "submitting" });
    const result = await withdrawAccount({
      category: DEFAULT_WITHDRAW_CATEGORY,
      detail: null,
    });
    if (result.ok) {
      setState({ kind: "success" });
      return;
    }
    if (result.reason === "active-reservation") {
      setState({ kind: "active-reservation", message: result.message });
      return;
    }
    if (result.reason === "auth-delete-failed") {
      setState({ kind: "auth-delete-failed", message: result.message });
      return;
    }
    setState({ kind: "error", message: result.message });
  };

  const handleSubmit = async () => {
    if (!agreed) return;
    if (isPasswordProvider) {
      if (password.length === 0) return;
      setState({ kind: "submitting" });
      // 본인 확인: 비밀번호 재인증 후 탈퇴. 비번이 틀리면 폼으로 되돌려 안내.
      const reauth = await reauthenticateMyPassword(password);
      if (!reauth.ok) {
        setState({ kind: "error", message: reauth.message });
        return;
      }
    }
    await runWithdraw();
  };

  // 탈퇴 완료 확인: 로컬 세션 정리 후 홈으로. signOut 실패는 경고만 남긴다
  // (서버 계정은 이미 삭제됨 — 세션 정리 실패로 사용자를 막지 않는다).
  const handleSuccess = async () => {
    try {
      const { auth } = getFirebaseClient();
      await signOut(auth);
    } catch (error) {
      console.warn("[withdraw] signOut failed:", error);
    }
    router.replace("/");
  };

  const secondaryButtonClass =
    "inline-flex h-10 items-center justify-center rounded-md border border-line-strong bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-400";
  const primaryButtonClass =
    "inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover";

  // ── 상태별 얼리 리턴: 성공 → 진행중예약 → Auth 삭제 실패 → 기본 폼 ──

  if (state.kind === "success") {
    return (
      <Modal>
        <h2 className="text-lg font-bold text-slate-950">{tW("successTitle")}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          {tW("successDesc")}
        </p>
        <ModalActions>
          <button
            type="button"
            onClick={handleSuccess}
            className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent-hover"
          >
            {tW("confirm")}
          </button>
        </ModalActions>
      </Modal>
    );
  }

  if (state.kind === "active-reservation") {
    return (
      <Modal>
        <h2 className="text-lg font-bold text-slate-950">
          {tW("activeReservationTitle")}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-700">{state.message}</p>
        <ModalActions>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            {tW("close")}
          </button>
          <Link href="/mypage" className={primaryButtonClass}>
            {t("tabReservations")}
          </Link>
        </ModalActions>
      </Modal>
    );
  }

  if (state.kind === "auth-delete-failed") {
    return (
      <Modal>
        <h2 className="text-lg font-bold text-slate-950">{tW("authFailTitle")}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-700">{state.message}</p>
        <ModalActions>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            {tW("close")}
          </button>
          <button
            type="button"
            onClick={runWithdraw}
            className="inline-flex h-10 items-center justify-center rounded-md bg-error px-4 text-sm font-semibold text-white transition hover:bg-error/90"
          >
            {tW("retry")}
          </button>
        </ModalActions>
      </Modal>
    );
  }

  return (
    <Modal labelledBy="withdraw-modal-title">
      <h2 id="withdraw-modal-title" className="text-lg font-bold text-slate-950">
        {t("withdrawButton")}
      </h2>

      <div className="mt-4 rounded-md bg-surface-2/60 px-4 py-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            disabled={state.kind === "submitting"}
            className="size-4 accent-accent"
          />
          <span>
            <span className="text-accent-strong">{t("wdRequired")}</span>{" "}
            {t("wdAgree")}
          </span>
        </label>

        {isPasswordProvider ? (
          <div className="mt-4 border-t border-line pt-4">
            <FieldLabel htmlFor="withdraw-password">{t("wdPwLabel")}</FieldLabel>
            <input
              id="withdraw-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (state.kind === "error") setState({ kind: "form" });
              }}
              placeholder={t("gatePlaceholder")}
              disabled={state.kind === "submitting"}
              className={`mt-2 w-full ${INPUT_CLASS}`}
            />
          </div>
        ) : null}
      </div>

      {state.kind === "error" ? (
        <p
          className="mt-3 rounded-md border border-error/30 bg-error/10 px-3 py-2 text-sm text-error"
          role="alert"
        >
          {state.message}
        </p>
      ) : null}

      <ModalActions align="center">
        <button
          type="button"
          onClick={onClose}
          disabled={state.kind === "submitting"}
          className="inline-flex h-11 min-w-[110px] items-center justify-center rounded-md border border-line-strong bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed"
        >
          {tW("confirmCancel")}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="inline-flex h-11 min-w-[110px] items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {state.kind === "submitting" ? tW("submitting") : t("withdrawButton")}
        </button>
      </ModalActions>
    </Modal>
  );
}
