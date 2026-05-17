"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { signInWithEmail } from "@/lib/firebase-email-auth";
import { signInWithGoogle } from "@/lib/firebase-google-auth";
import { startKakaoLogin } from "@/lib/firebase-kakao-auth";
import { startNaverLogin } from "@/lib/firebase-naver-auth";
import { sanitizeFromPath } from "@/lib/use-require-auth";
import { ensureUserProfile } from "@/lib/user-profile-client";
import {
  getFirebaseAuthSessionServerSnapshot,
  getFirebaseAuthSessionSnapshot,
  parseFirebaseAuthSessionSnapshot,
  subscribeFirebaseAuthSession,
} from "@/lib/firebase-auth-session";
import { useSyncExternalStore } from "react";

type SubmitState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string };

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

  async function handleEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
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

  async function handleKakao() {
    setSubmitState({ kind: "loading" });
    const result = await startKakaoLogin();
    if (!result.ok) {
      setSubmitState({ kind: "error", message: result.message });
    }
    // ok이면 window.location 이동 중.
  }

  async function handleNaver() {
    setSubmitState({ kind: "loading" });
    const result = await startNaverLogin();
    if (!result.ok) {
      setSubmitState({ kind: "error", message: result.message });
    }
  }

  const isLoading = submitState.kind === "loading";

  return (
    <section className="w-full rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold text-slate-950">로그인</h1>
      <p className="mt-1 text-sm text-slate-600">
        이메일/비밀번호 또는 소셜 계정으로 로그인하세요.
      </p>

      <form className="mt-5 flex flex-col gap-3" onSubmit={handleEmailSubmit}>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-slate-800">이메일</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10 rounded-md border border-slate-300 px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-slate-800">비밀번호</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10 rounded-md border border-slate-300 px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
          />
        </label>
        <button
          type="submit"
          disabled={isLoading}
          className="mt-1 inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isLoading ? "로그인 중" : "이메일로 로그인"}
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

      <div className="my-5 flex items-center gap-2 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        <span>또는</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleGoogle}
          disabled={isLoading}
          className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-sky-400 disabled:cursor-not-allowed disabled:border-slate-200"
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
          className="font-semibold text-sky-700 underline-offset-2 hover:underline"
        >
          회원가입
        </Link>
        {"  ·  "}
        <Link
          href="/reset-password"
          className="font-semibold text-sky-700 underline-offset-2 hover:underline"
        >
          비밀번호 재설정
        </Link>
      </p>
    </section>
  );
}
