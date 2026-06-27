"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { signInWithGoogle } from "@/lib/firebase-google-auth";
import { startKakaoLogin } from "@/lib/firebase-kakao-auth";
import { startNaverLogin } from "@/lib/firebase-naver-auth";

// 회원가입 1단계: 본인 인증(= 가입 방식 선택). 소셜은 OAuth로 신원을 확인하고,
// 이메일은 다음 단계(약관 → 정보입력)에서 계정을 만든다.
// 구글은 popup이라 성공 시 즉시 onSocialAuthenticated로 다음 단계 진행.
// 카카오/네이버는 redirect라 이 페이지를 떠나고, 복귀는 handover가 처리한다.

type AuthState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string };

export function SignupAuthStep({
  onSelectEmail,
  onSocialAuthenticated,
}: {
  onSelectEmail: () => void;
  onSocialAuthenticated: () => void;
}) {
  const t = useTranslations("Auth");
  const [state, setState] = useState<AuthState>({ kind: "idle" });
  const isLoading = state.kind === "loading";

  async function handleGoogle() {
    setState({ kind: "loading" });
    const result = await signInWithGoogle();
    if (result.ok) {
      onSocialAuthenticated();
      return;
    }
    if (result.cancelled) {
      setState({ kind: "idle" });
      return;
    }
    setState({ kind: "error", message: result.message });
  }

  async function handleKakao() {
    setState({ kind: "loading" });
    const result = await startKakaoLogin();
    if (!result.ok) {
      setState({ kind: "error", message: result.message });
    }
  }

  async function handleNaver() {
    setState({ kind: "loading" });
    const result = await startNaverLogin();
    if (!result.ok) {
      setState({ kind: "error", message: result.message });
    }
  }

  return (
    <section className="w-full rounded-lg border border-line bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold text-slate-950">{t("authStepTitle")}</h1>
      <p className="mt-1 text-sm text-slate-600">{t("authStepSubtitle")}</p>

      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          onClick={handleNaver}
          disabled={isLoading}
          className="inline-flex h-11 items-center justify-center rounded-md border border-emerald-600 bg-emerald-500 px-4 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed"
        >
          {t("naver")}
        </button>
        <button
          type="button"
          onClick={handleKakao}
          disabled={isLoading}
          className="inline-flex h-11 items-center justify-center rounded-md border border-yellow-400 bg-yellow-300 px-4 text-sm font-semibold text-slate-900 transition hover:bg-yellow-400 disabled:cursor-not-allowed"
        >
          {t("kakao")}
        </button>
        <button
          type="button"
          onClick={handleGoogle}
          disabled={isLoading}
          className="inline-flex h-11 items-center justify-center rounded-md border border-line-strong bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-accent disabled:cursor-not-allowed disabled:border-line"
        >
          {t("google")}
        </button>
      </div>

      <div className="my-5 flex items-center gap-2 text-xs text-slate-400">
        <span className="h-px flex-1 bg-line" />
        <span>{t("or")}</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <button
        type="button"
        onClick={onSelectEmail}
        disabled={isLoading}
        className="inline-flex h-11 w-full items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {t("authStepEmail")}
      </button>

      {state.kind === "error" ? (
        <p
          className="mt-3 rounded-md border border-error/30 bg-error/10 px-3 py-2 text-sm text-error"
          role="alert"
        >
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
