"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { getFirebaseClient } from "@/lib/firebase-client";
import { reauthenticateMyPassword } from "@/lib/firebase-password-update";
import { withdrawAccount } from "@/lib/withdrawal-client";
import { AlertModal } from "@/components/ui/alert-modal";

// 탈퇴 사유 카테고리를 노출하지 않으므로 기본값으로 저장한다(구 모달과 동일 정책).
const DEFAULT_WITHDRAW_CATEGORY = "기타" as const;

/**
 * 회원탈퇴 인라인 섹션(회원정보변경 탭 안에서 폼을 대체해 노출).
 *
 * 기존 팝업(WithdrawModal) 대신 회원탈퇴 페이지 형태로 인라인 렌더한다.
 * - 비번 회원은 비밀번호 재인증, 소셜 회원은 동의만으로 진행한다.
 * - 백엔드의 부분 실패는 성공처럼 숨기지 않고 상태별로 명시한다:
 *   · active-reservation : 진행 중 예약이 있어 탈퇴 불가 → 예약내역 이동 안내
 *   · auth-delete-failed : DB 처리 후 Auth 삭제 실패 → 재시도(멱등 재시도 경로)
 */
export function AccountWithdrawSection({
  isPasswordProvider,
  onCancel,
}: {
  isPasswordProvider: boolean;
  onCancel: () => void;
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

  // 탈퇴 본체. auth-delete-failed 재시도에서도 그대로 다시 호출한다(멱등).
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

  const submitting = state.kind === "submitting";

  return (
    <div className="mx-auto w-[1368px] max-w-full">
      {/* 제목 34px */}
      <h2 className="text-[34px] font-bold text-foreground">
        {t("withdrawButton")}
      </h2>

      {/* 동의 + 비밀번호 박스: 1368×270, padding 상하 32 / 좌우 40 */}
      <div className="mt-6 rounded-2xl bg-surface-2 px-10 py-8">
        <label className="flex cursor-pointer items-center gap-2.5 text-[18px] font-bold text-slate-800">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            disabled={submitting}
            className="size-5 accent-accent"
          />
          <span>
            <span className="text-accent-strong">{t("wdRequired")}</span>{" "}
            {t("wdAgree")}
          </span>
        </label>

        {isPasswordProvider ? (
          <>
            {/* 구분선 위·아래 간격 40px */}
            <div className="my-10 border-t border-line" />
            <p className="text-[18px] font-bold text-slate-800">
              {t("gateTitle")}
            </p>
            {/* 라벨-입력칸 간격 20px, 입력칸 1288×56 */}
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (state.kind === "error") setState({ kind: "form" });
              }}
              placeholder={t("gatePlaceholder")}
              disabled={submitting}
              className="mt-5 h-[56px] w-full rounded-md border border-line-strong bg-white px-4 text-[16px] tracking-[0.2em] text-slate-950 placeholder:tracking-normal placeholder:text-slate-400 focus:border-[#111] focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
            />
          </>
        ) : null}
      </div>

      {/* 부분 실패/오류 안내 (성공처럼 숨기지 않는다) */}
      {state.kind === "active-reservation" ? (
        <div
          className="mt-4 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm leading-6 text-warning"
          role="alert"
        >
          <p className="font-bold">{tW("activeReservationTitle")}</p>
          <p className="mt-1">{state.message}</p>
          <Link
            href="/mypage"
            className="mt-2 inline-block font-semibold text-accent-strong underline-offset-2 hover:underline"
          >
            {t("tabReservations")}
          </Link>
        </div>
      ) : null}
      {state.kind === "auth-delete-failed" ? (
        <div
          className="mt-4 rounded-md border border-error/30 bg-error/10 px-4 py-3 text-sm leading-6 text-error"
          role="alert"
        >
          <p className="font-bold">{tW("authFailTitle")}</p>
          <p className="mt-1">{state.message}</p>
          <button
            type="button"
            onClick={runWithdraw}
            className="mt-2 font-semibold text-error underline-offset-2 hover:underline"
          >
            {tW("retry")}
          </button>
        </div>
      ) : null}
      {state.kind === "error" ? (
        <p
          className="mt-4 rounded-md border border-error/30 bg-error/10 px-4 py-3 text-sm text-error"
          role="alert"
        >
          {state.message}
        </p>
      ) : null}

      {/* 취소 / 회원탈퇴 — 각 160×60, 18px, radius 30. 회원탈퇴는 네이비.
          위·아래 간격을 기존의 두 배로 넓힌다(my-16). 취소는 hover 시 네이비. */}
      <div className="my-16 flex justify-center gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="inline-flex h-[60px] w-[160px] items-center justify-center rounded-[30px] border border-line-strong bg-white text-[18px] font-semibold text-slate-700 transition hover:border-accent hover:text-accent-strong disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {tW("confirmCancel")}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="inline-flex h-[60px] w-[160px] items-center justify-center rounded-[30px] bg-accent text-[18px] font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          {submitting ? tW("submitting") : t("withdrawButton")}
        </button>
      </div>

      {/* 탈퇴 완료 안내 — 확인 시 세션 정리 후 홈으로 */}
      {state.kind === "success" ? (
        <AlertModal message={tW("successDesc")} onClose={handleSuccess} />
      ) : null}
    </div>
  );
}
