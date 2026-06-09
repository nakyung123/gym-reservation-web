"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { signInWithEmail } from "@/lib/firebase-email-auth";
import { signInWithGoogle } from "@/lib/firebase-google-auth";
import { startKakaoLogin } from "@/lib/firebase-kakao-auth";
import { startNaverLogin } from "@/lib/firebase-naver-auth";
import { OAUTH_FROM_STORAGE_KEY, sanitizeFromPath } from "@/lib/use-require-auth";
import { ensureUserProfile } from "@/lib/user-profile-client";
import {
  getFirebaseAuthSessionServerSnapshot,
  getFirebaseAuthSessionSnapshot,
  parseFirebaseAuthSessionSnapshot,
  subscribeFirebaseAuthSession,
} from "@/lib/firebase-auth-session";
import { PasswordField, TextField } from "@/components/form-fields";

type SubmitState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string };

function validateEmail(value: string): string | null {
  if (value.length === 0) return null;
  const at = value.indexOf("@");
  if (at <= 0 || at === value.length - 1) {
    return "이메일 형식이 올바르지 않습니다.";
  }
  return null;
}

export function LoginView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromPath = sanitizeFromPath(searchParams.get("from")) ?? "/mypage";

  const snapshot = useSyncExternalStore(
    subscribeFirebaseAuthSession,
    getFirebaseAuthSessionSnapshot,
    getFirebaseAuthSessionServerSnapshot,
  );
  const session = parseFirebaseAuthSessionSnapshot(snapshot);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });

  // 이미 로그인되어 있으면 from으로 즉시 redirect.
  useEffect(() => {
    if (session.ok) {
      router.replace(fromPath);
    }
  }, [session, fromPath, router]);

  const emailError = validateEmail(email);
  const isFormValid = email.length > 0 && password.length > 0 && !emailError;

  async function handleEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isFormValid) return;
    setSubmitState({ kind: "loading" });
    const result = await signInWithEmail({ email, password });
    if (result.ok) {
      await ensureUserProfile().catch((error) => {
        console.warn("[login] ensureUserProfile failed:", error);
      });
      router.replace(fromPath);
      return;
    }
    setSubmitState({ kind: "error", message: result.message });
  }

  async function handleGoogle() {
    setSubmitState({ kind: "loading" });
    const result = await signInWithGoogle();
    if (result.ok) {
      await ensureUserProfile().catch((error) => {
        console.warn("[login] ensureUserProfile failed:", error);
      });
      router.replace(fromPath);
      return;
    }
    if (result.cancelled) {
      setSubmitState({ kind: "idle" });
      return;
    }
    setSubmitState({ kind: "error", message: result.message });
  }

  // 소셜 OAuth는 외부 redirect 흐름이라 from path를 server state에 박지 않고
  // sessionStorage에 잠시 저장한다. handover-flow가 success 시 pop해서 사용한다.
  function persistOauthFromPath() {
    try {
      if (fromPath && fromPath !== "/mypage") {
        window.sessionStorage.setItem(OAUTH_FROM_STORAGE_KEY, fromPath);
      } else {
        window.sessionStorage.removeItem(OAUTH_FROM_STORAGE_KEY);
      }
    } catch {
      // sessionStorage 불가 환경(시크릿/저장공간 부족)에서는 default로 /mypage.
    }
  }

  async function handleKakao() {
    setSubmitState({ kind: "loading" });
    persistOauthFromPath();
    const result = await startKakaoLogin();
    if (!result.ok) {
      setSubmitState({ kind: "error", message: result.message });
    }
  }

  async function handleNaver() {
    setSubmitState({ kind: "loading" });
    persistOauthFromPath();
    const result = await startNaverLogin();
    if (!result.ok) {
      setSubmitState({ kind: "error", message: result.message });
    }
  }

  const isLoading = submitState.kind === "loading";

  return (
    <section className="w-full rounded-lg border border-line bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold text-slate-950">로그인</h1>
      <p className="mt-1 text-sm text-slate-600">
        이메일/비밀번호 또는 소셜 계정으로 로그인하세요.
      </p>

      <form className="mt-5 flex flex-col gap-3" onSubmit={handleEmailSubmit} noValidate>
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
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
        />
        <button
          type="submit"
          disabled={isLoading || !isFormValid}
          className="mt-1 inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isLoading ? "로그인 중" : "이메일로 로그인"}
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

      <div className="my-5 flex items-center gap-2 text-xs text-slate-400">
        <span className="h-px flex-1 bg-line" />
        <span>또는</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleGoogle}
          disabled={isLoading}
          className="inline-flex h-10 items-center justify-center rounded-md border border-line-strong bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-accent disabled:cursor-not-allowed disabled:border-line"
        >
          Google로 로그인
        </button>
        <button
          type="button"
          onClick={handleKakao}
          disabled={isLoading}
          className="inline-flex h-10 items-center justify-center rounded-md border border-yellow-400 bg-yellow-300 px-4 text-sm font-semibold text-slate-900 transition hover:bg-yellow-400 disabled:cursor-not-allowed"
        >
          카카오로 로그인
        </button>
        <button
          type="button"
          onClick={handleNaver}
          disabled={isLoading}
          className="inline-flex h-10 items-center justify-center rounded-md border border-emerald-600 bg-emerald-500 px-4 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed"
        >
          네이버로 로그인
        </button>
      </div>

      <p className="mt-5 text-center text-sm text-slate-600">
        계정이 없으신가요?{" "}
        <Link
          href={`/signup${fromPath !== "/mypage" ? `?from=${encodeURIComponent(fromPath)}` : ""}`}
          className="font-semibold text-accent-strong underline-offset-2 hover:underline"
        >
          회원가입
        </Link>
        {"  ·  "}
        <Link
          href="/reset-password"
          className="font-semibold text-accent-strong underline-offset-2 hover:underline"
        >
          비밀번호 재설정
        </Link>
      </p>
    </section>
  );
}
