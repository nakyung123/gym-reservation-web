"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { signupWithEmail } from "@/lib/firebase-email-auth";
import { sanitizeFromPath } from "@/lib/use-require-auth";

type SubmitState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string };

export function SignupView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromPath = sanitizeFromPath(searchParams.get("from")) ?? "/mypage";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [nickname, setNickname] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password.length < 8) {
      setSubmitState({
        kind: "error",
        message: "비밀번호는 8자 이상이어야 합니다.",
      });
      return;
    }
    if (password !== passwordConfirm) {
      setSubmitState({
        kind: "error",
        message: "비밀번호 확인이 일치하지 않습니다.",
      });
      return;
    }
    if (!nickname.trim()) {
      setSubmitState({
        kind: "error",
        message: "닉네임을 입력해 주세요.",
      });
      return;
    }
    setSubmitState({ kind: "loading" });
    const result = await signupWithEmail({
      email,
      password,
      nickname: nickname.trim(),
    });
    if (result.ok) {
      // 회원가입 성공 시 Firebase가 자동 로그인 상태로 만든다.
      router.replace(fromPath);
      return;
    }
    setSubmitState({ kind: "error", message: result.message });
  }

  const isLoading = submitState.kind === "loading";

  return (
    <section className="w-full rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold text-slate-950">회원가입</h1>
      <p className="mt-1 text-sm text-slate-600">
        이메일과 비밀번호로 가입하세요. 가입 후 이메일 인증 메일이 발송됩니다.
      </p>

      <form className="mt-5 flex flex-col gap-3" onSubmit={handleSubmit}>
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
          <span className="text-sm font-semibold text-slate-800">
            비밀번호 (8자 이상)
          </span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10 rounded-md border border-slate-300 px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-slate-800">
            비밀번호 확인
          </span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            className="h-10 rounded-md border border-slate-300 px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-slate-800">닉네임</span>
          <input
            type="text"
            required
            maxLength={30}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="h-10 rounded-md border border-slate-300 px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
          />
        </label>
        <button
          type="submit"
          disabled={isLoading}
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
