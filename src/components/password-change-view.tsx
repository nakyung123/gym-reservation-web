"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseClient } from "@/lib/firebase-client";
import { useRequireAuth } from "@/lib/use-require-auth";
import {
  updateMyPassword,
  type UpdatePasswordFailureReason,
} from "@/lib/firebase-password-update";
import { PasswordField } from "@/components/form-fields";

type AuthUserState =
  | { status: "loading" }
  | { status: "ready"; user: User }
  | { status: "signed-out" };

type SubmitState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success" }
  | {
      kind: "error";
      reason: UpdatePasswordFailureReason;
      message: string;
    };

function validateNewPassword(value: string): string | null {
  if (value.length === 0) return null;
  if (value.length < 8) return "비밀번호는 8자 이상이어야 합니다.";
  return null;
}

export function PasswordChangeView() {
  const router = useRouter();
  // signed-out 감지 + redirect는 useRequireAuth가 처리. 본 컴포넌트는 user 객체 자체가
  // 필요해서 onAuthStateChanged로 직접 구독한다 (providerData 확인용).
  useRequireAuth({ from: "/mypage/password" });

  const [authState, setAuthState] = useState<AuthUserState>({
    status: "loading",
  });
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });

  useEffect(() => {
    const { auth } = getFirebaseClient();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthState(user ? { status: "ready", user } : { status: "signed-out" });
    });
    return unsubscribe;
  }, []);

  if (authState.status === "loading" || authState.status === "signed-out") {
    return (
      <section className="w-full rounded-lg border border-line bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">로그인 상태를 확인하는 중입니다...</p>
      </section>
    );
  }

  const { user } = authState;
  const isPasswordProvider = user.providerData.some(
    (p) => p.providerId === "password",
  );

  if (!isPasswordProvider) {
    return (
      <section className="w-full rounded-lg border border-line bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-950">비밀번호 변경</h1>
        <p className="mt-3 text-sm text-slate-600">
          이 계정은 소셜 로그인으로 가입되어 비밀번호를 사용하지 않습니다.
        </p>
        <Link
          href="/mypage"
          className="mt-5 inline-flex h-10 items-center justify-center rounded-md border border-line-strong bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          내 정보로 돌아가기
        </Link>
      </section>
    );
  }

  // 현재 비밀번호 불일치 에러는 해당 필드 인라인으로 빨갛게 표시한다.
  // 그 외 에러(weak-password 등)는 폼 하단 박스로 표시.
  const wrongCurrentPasswordError =
    submitState.kind === "error" &&
    submitState.reason === "wrong-current-password"
      ? submitState.message
      : null;
  const otherError =
    submitState.kind === "error" &&
    submitState.reason !== "wrong-current-password"
      ? submitState.message
      : null;

  const newPasswordError = validateNewPassword(newPassword);
  const newPasswordConfirmError =
    newPasswordConfirm.length > 0 && newPasswordConfirm !== newPassword
      ? "새 비밀번호 확인이 일치하지 않습니다."
      : null;
  const sameAsCurrentError =
    newPassword.length > 0 &&
    currentPassword.length > 0 &&
    newPassword === currentPassword
      ? "현재 비밀번호와 다른 값을 사용해 주세요."
      : null;

  const isLoading = submitState.kind === "loading";
  const isSuccess = submitState.kind === "success";
  const isFormValid =
    currentPassword.length > 0 &&
    newPassword.length > 0 &&
    newPasswordConfirm.length > 0 &&
    !newPasswordError &&
    !newPasswordConfirmError &&
    !sameAsCurrentError;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isFormValid || isLoading || isSuccess) return;
    setSubmitState({ kind: "loading" });
    const result = await updateMyPassword({ currentPassword, newPassword });
    if (result.ok) {
      setSubmitState({ kind: "success" });
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
      return;
    }
    setSubmitState({
      kind: "error",
      reason: result.reason,
      message: result.message,
    });
  }

  // 현재 비밀번호 필드 onChange 시 이전 wrong-password 에러 메시지는 자연스럽게 사라지도록
  // submitState를 idle로 리셋한다.
  function handleCurrentPasswordChange(value: string) {
    setCurrentPassword(value);
    if (
      submitState.kind === "error" &&
      submitState.reason === "wrong-current-password"
    ) {
      setSubmitState({ kind: "idle" });
    }
  }

  return (
    <>
      <section className="w-full rounded-lg border border-line bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-950">비밀번호 변경</h1>
        <p className="mt-1 text-sm text-slate-600">
          보안을 위해 현재 비밀번호를 입력한 뒤 새 비밀번호를 설정해 주세요.
        </p>

        <form className="mt-5 flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
          <PasswordField
            label="현재 비밀번호"
            autoComplete="current-password"
            value={currentPassword}
            onChange={handleCurrentPasswordChange}
            error={wrongCurrentPasswordError}
            disabled={isLoading || isSuccess}
          />
          <PasswordField
            label="새 비밀번호 (8자 이상)"
            autoComplete="new-password"
            value={newPassword}
            onChange={setNewPassword}
            error={newPasswordError ?? sameAsCurrentError}
            disabled={isLoading || isSuccess}
          />
          <PasswordField
            label="새 비밀번호 확인"
            autoComplete="new-password"
            value={newPasswordConfirm}
            onChange={setNewPasswordConfirm}
            error={newPasswordConfirmError}
            disabled={isLoading || isSuccess}
          />

          <div className="mt-2 flex gap-2">
            <Link
              href="/mypage"
              className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-line-strong bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              취소
            </Link>
            <button
              type="submit"
              disabled={!isFormValid || isLoading || isSuccess}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isLoading ? "변경 중" : "변경하기"}
            </button>
          </div>
        </form>

        {otherError ? (
          <p
            className="mt-3 rounded-md border border-error/30 bg-error/10 px-3 py-2 text-sm text-error"
            role="alert"
          >
            {otherError}
          </p>
        ) : null}
      </section>

      {isSuccess ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="password-success-title"
        >
          <div className="w-full max-w-sm rounded-lg border border-line bg-white p-6 shadow-xl">
            <h2
              id="password-success-title"
              className="text-lg font-bold text-slate-950"
            >
              비밀번호가 변경되었습니다
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              새 비밀번호로 다시 로그인이 필요할 수 있습니다.
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => router.replace("/mypage")}
                className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent-hover"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
