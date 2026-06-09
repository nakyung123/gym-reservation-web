"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { signupWithEmail } from "@/lib/firebase-email-auth";
import {
  PASSWORD_POLICY_HINT,
  validatePasswordPolicy,
} from "@/lib/password-policy";
import { sanitizeFromPath } from "@/lib/use-require-auth";
import { ensureUserProfile } from "@/lib/user-profile-client";
import { PasswordField, TextField } from "@/components/form-fields";
import { SignupTermsStep } from "@/components/signup-terms-step";

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

type SignupStep = "terms" | "form";

export function SignupView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromPath = sanitizeFromPath(searchParams.get("from")) ?? "/mypage";

  // 약관 동의 → 가입 form 단계. 단방향이라 form 단계에서 약관으로 되돌아가지 않는다.
  const [step, setStep] = useState<SignupStep>("terms");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });

  const emailError = validateEmail(email);
  const passwordError = validatePasswordPolicy(password);
  const passwordConfirmError =
    passwordConfirm.length > 0 && passwordConfirm !== password
      ? "비밀번호 확인이 일치하지 않습니다."
      : null;

  const isLoading = submitState.kind === "loading";
  const isFormValid =
    email.length > 0 &&
    password.length > 0 &&
    passwordConfirm.length > 0 &&
    !emailError &&
    !passwordError &&
    !passwordConfirmError;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isFormValid) return;
    setSubmitState({ kind: "loading" });
    const result = await signupWithEmail({ email, password });
    if (result.ok) {
      // 닉네임은 서버에서 자동 생성된다.
      await ensureUserProfile().catch((error) => {
        console.warn("[signup] ensureUserProfile failed:", error);
      });
      router.replace(fromPath);
      return;
    }
    setSubmitState({ kind: "error", message: result.message });
  }

  if (step === "terms") {
    return <SignupTermsStep onAgree={() => setStep("form")} />;
  }

  return (
    <section className="w-full rounded-lg border border-line bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold text-slate-950">회원가입</h1>
      <p className="mt-1 text-sm text-slate-600">
        이메일과 비밀번호로 가입하세요. 닉네임은 자동으로 만들어지며 가입 후 내 정보에서 변경할 수 있습니다.
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
          label="비밀번호"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          error={passwordError}
          hint={PASSWORD_POLICY_HINT}
        />
        <PasswordField
          label="비밀번호 확인"
          autoComplete="new-password"
          value={passwordConfirm}
          onChange={setPasswordConfirm}
          error={passwordConfirmError}
        />
        <button
          type="submit"
          disabled={isLoading || !isFormValid}
          className="mt-1 inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isLoading ? "가입 중" : "가입하기"}
        </button>
      </form>

      {submitState.kind === "error" ? (
        <p
          className="mt-3 rounded-md border border-error/30 bg-error/10 px-3 py-2 text-sm text-error"
          role="alert"
        >
          {submitState.message}
        </p>
      ) : null}

      <p className="mt-5 text-center text-sm text-slate-600">
        이미 계정이 있으신가요?{" "}
        <Link
          href="/login"
          className="font-semibold text-accent-strong underline-offset-2 hover:underline"
        >
          로그인
        </Link>
      </p>
    </section>
  );
}
