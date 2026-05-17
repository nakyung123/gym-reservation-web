"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { signupWithEmail } from "@/lib/firebase-email-auth";
import { sanitizeFromPath } from "@/lib/use-require-auth";
import { ensureUserProfile } from "@/lib/user-profile-client";
import { checkNicknameAvailability } from "@/lib/nickname-availability-client";
import { PasswordField, TextField } from "@/components/form-fields";

type SubmitState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string };

// 단순 이메일 형식 체크: '@'와 도메인 부분이 있는지만 인라인 안내용.
// 실제 검증은 Firebase가 한다 (auth/invalid-email).
function validateEmail(value: string): string | null {
  if (value.length === 0) return null;
  const at = value.indexOf("@");
  if (at <= 0 || at === value.length - 1) {
    return "이메일 형식이 올바르지 않습니다.";
  }
  return null;
}

function validatePassword(value: string): string | null {
  if (value.length === 0) return null;
  if (value.length < 8) return "비밀번호는 8자 이상이어야 합니다.";
  return null;
}

export function SignupView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromPath = sanitizeFromPath(searchParams.get("from")) ?? "/mypage";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [nickname, setNickname] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });
  const [nicknameStatus, setNicknameStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "error"
  >("idle");

  // 닉네임 입력 → 400ms debounce → /api/me/nickname-availability 조회.
  // effect 안에서 직접 setState 호출하는 패턴이라 react-hooks/set-state-in-effect는 의도적으로 disable.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const trimmed = nickname.trim();
    if (trimmed.length === 0) {
      setNicknameStatus("idle");
      return;
    }
    setNicknameStatus("checking");
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const result = await checkNicknameAvailability(trimmed, controller.signal);
        if (controller.signal.aborted) return;
        if (!result.ok) {
          setNicknameStatus("error");
          return;
        }
        if (result.available) {
          setNicknameStatus("available");
        } else {
          setNicknameStatus(result.reason === "invalid" ? "error" : "taken");
        }
      } catch {
        if (!controller.signal.aborted) setNicknameStatus("error");
      }
    }, 400);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [nickname]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const emailError = validateEmail(email);
  const passwordError = validatePassword(password);
  const passwordConfirmError =
    passwordConfirm.length > 0 && passwordConfirm !== password
      ? "비밀번호 확인이 일치하지 않습니다."
      : null;
  const nicknameError =
    nickname.length > 0 && nickname.trim().length === 0
      ? "닉네임을 입력해 주세요."
      : nicknameStatus === "taken"
        ? "이미 사용 중인 닉네임입니다."
        : null;
  const nicknameHint =
    nickname.length > 0 && nicknameStatus === "available"
      ? "사용 가능한 닉네임입니다."
      : nicknameStatus === "checking"
        ? "확인 중..."
        : null;

  const isLoading = submitState.kind === "loading";
  const isFormValid =
    email.length > 0 &&
    password.length > 0 &&
    passwordConfirm.length > 0 &&
    nickname.trim().length > 0 &&
    !emailError &&
    !passwordError &&
    !passwordConfirmError &&
    !nicknameError &&
    nicknameStatus !== "checking" &&
    nicknameStatus !== "taken";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isFormValid) return;
    setSubmitState({ kind: "loading" });
    const result = await signupWithEmail({
      email,
      password,
      nickname: nickname.trim(),
    });
    if (result.ok) {
      await ensureUserProfile().catch((error) => {
        console.warn("[signup] ensureUserProfile failed:", error);
      });
      router.replace(fromPath);
      return;
    }
    setSubmitState({ kind: "error", message: result.message });
  }

  return (
    <section className="w-full rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold text-slate-950">회원가입</h1>
      <p className="mt-1 text-sm text-slate-600">
        이메일과 비밀번호로 가입하세요. 가입 후 이메일 인증 메일이 발송됩니다.
      </p>

      <form className="mt-5 flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
        <TextField
          label="이메일"
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          error={emailError}
        />
        <PasswordField
          label="비밀번호 (8자 이상)"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          error={passwordError}
        />
        <PasswordField
          label="비밀번호 확인"
          autoComplete="new-password"
          value={passwordConfirm}
          onChange={setPasswordConfirm}
          error={passwordConfirmError}
        />
        <TextField
          label="닉네임"
          maxLength={30}
          value={nickname}
          onChange={setNickname}
          error={nicknameError}
          hint={nicknameHint}
        />
        <button
          type="submit"
          disabled={isLoading || !isFormValid}
          className="mt-1 inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isLoading ? "가입 중" : "가입하기"}
        </button>
      </form>

      {submitState.kind === "error" ? (
        <p
          className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
          role="alert"
        >
          {submitState.message}
        </p>
      ) : null}

      <p className="mt-5 text-center text-sm text-slate-600">
        이미 계정이 있으신가요?{" "}
        <Link
          href="/login"
          className="font-semibold text-sky-700 underline-offset-2 hover:underline"
        >
          로그인
        </Link>
      </p>
    </section>
  );
}
