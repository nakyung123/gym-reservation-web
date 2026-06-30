"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { signInWithEmail } from "@/lib/firebase-email-auth";
import { signInWithLoginId } from "@/lib/firebase-login-id-auth";
import { signInWithGoogle } from "@/lib/firebase-google-auth";
import { startKakaoLogin } from "@/lib/firebase-kakao-auth";
import { startNaverLogin } from "@/lib/firebase-naver-auth";
import { signInWithFacebook } from "@/lib/firebase-facebook-auth";
import { OAUTH_FROM_STORAGE_KEY, sanitizeFromPath } from "@/lib/use-require-auth";
import { ensureUserProfile } from "@/lib/user-profile-client";
import {
  getFirebaseAuthSessionServerSnapshot,
  getFirebaseAuthSessionSnapshot,
  parseFirebaseAuthSessionSnapshot,
  subscribeFirebaseAuthSession,
} from "@/lib/firebase-auth-session";

type SubmitState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string };

// 로그인 식별자가 이메일인지 아이디인지 판별한다. '@'가 있으면 이메일로 본다.
// 이메일이면 Firebase Email 로그인, 아니면 아이디 로그인(서버 변환) 경로로 보낸다.
function looksLikeEmail(value: string): boolean {
  return value.includes("@");
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

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberId, setRememberId] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });

  // 이미 로그인되어 있으면 from으로 즉시 redirect.
  useEffect(() => {
    if (session.ok) {
      router.replace(fromPath);
    }
  }, [session, fromPath, router]);

  const isFormValid = identifier.length > 0 && password.length > 0;

  async function handleEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isFormValid) return;
    setSubmitState({ kind: "loading" });
    const trimmed = identifier.trim();
    // '@' 포함 = 이메일 로그인, 그 외 = 아이디 로그인(서버에서 이메일로 변환).
    const result = looksLikeEmail(trimmed)
      ? await signInWithEmail({ email: trimmed, password })
      : await signInWithLoginId({ loginId: trimmed, password });
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

  async function handleFacebook() {
    setSubmitState({ kind: "loading" });
    const result = await signInWithFacebook();
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

  const isLoading = submitState.kind === "loading";

  const signupHref = `/signup${fromPath !== "/mypage" ? `?from=${encodeURIComponent(fromPath)}` : ""}`;

  return (
    <div className="flex min-h-screen w-full flex-col bg-white">
      {/* 상단 헤더: 구분선은 풀폭, 내용(뒤로가기+로고+타이틀)은 본문과 같은 480 컬럼 폭에 정렬 */}
      <header className="w-full border-b border-[#c9c9c9]">
        <div className="relative mx-auto flex h-[61px] w-full max-w-[520px] items-center justify-center px-5">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="뒤로가기"
            className="absolute left-5 flex items-center justify-center text-[#252525]"
          >
            <svg
              width="12"
              height="20.56"
              viewBox="0 0 12 21"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M10 2 2 10.5 10 19" />
            </svg>
          </button>
          <div className="flex items-center gap-1.5">
            <span className="text-[20px] font-extrabold leading-none tracking-[-0.02em] text-accent">
              서울체육예약
            </span>
            <span className="text-[22px] font-bold leading-none text-[#252525]">
              통합 로그인
            </span>
          </div>
        </div>
      </header>

      {/* 본문: 480 가운데 컬럼 */}
      <div className="mx-auto w-full max-w-[520px] px-5 pb-10 pt-10">
        {/* 캐릭터 이미지 placeholder 160 x 159.5 */}
        <div className="mx-auto flex h-[159.5px] w-40 items-center justify-center rounded-full bg-[#e8eefb] text-xs text-accent">
          캐릭터
        </div>

        <h1 className="mt-6 text-center text-[23px] font-bold leading-[1.3] text-[#252525]">
          KMI 통합 회원 아이디로 로그인 해주세요.
        </h1>
        <p className="mt-4 text-center text-[20px] font-medium leading-[1.3] text-[#252525]">
          통합 회원으로 가입하면
          <br />
          예약/건강검진/결과조회를
          <br />
          하나의 계정으로 로그인 할 수 있습니다.
        </p>

        <form className="mt-7" onSubmit={handleEmailSubmit} noValidate>
          <input
            type="text"
            autoComplete="username"
            placeholder="아이디"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className="mb-[13px] h-[50px] w-full rounded-[3px] border border-[#d0d0d0] px-3 text-[16px] text-[#252525] placeholder:text-[#9b9b9b] focus:border-accent focus:outline-none"
          />
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-[50px] w-full rounded-[3px] border border-[#d0d0d0] px-3 pr-12 text-[16px] text-[#252525] placeholder:text-[#9b9b9b] focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
              className="absolute right-3 top-1/2 flex h-[22px] w-[22px] -translate-y-1/2 items-center justify-center text-[#9b9b9b]"
            >
              {showPassword ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 3l18 18" />
                  <path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a18.6 18.6 0 0 1-3.2 4.2M6.6 6.6A18.6 18.6 0 0 0 2 12s3.5 7 10 7a10.9 10.9 0 0 0 4.4-.9" />
                  <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                </svg>
              )}
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setRememberId((v) => !v)}
              className="flex items-center gap-2 text-[15px] text-[#252525]"
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                  rememberId
                    ? "border-accent bg-accent text-white"
                    : "border-[#c9c9c9] bg-[#e3e3e3] text-white"
                }`}
                aria-hidden="true"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12l5 5L20 7" />
                </svg>
              </span>
              아이디 저장
            </button>
            <Link href="/reset-password" className="text-[15px] text-[#252525]">
              아이디/비밀번호 찾기
            </Link>
          </div>

          <button
            type="submit"
            disabled={isLoading || !isFormValid}
            className="mt-[10px] h-[60px] w-full rounded-[3px] bg-[#121212] text-[18px] font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-90"
          >
            {isLoading ? "로그인 중…" : "통합 회원 로그인"}
          </button>
        </form>

        {submitState.kind === "error" ? (
          <p
            className="mt-3 rounded-[3px] border border-error/30 bg-error/10 px-3 py-2 text-sm text-error"
            role="alert"
          >
            {submitState.message}
          </p>
        ) : null}

        {/* 통합 회원가입 안내 */}
        <div className="flex flex-col items-center gap-3 py-5">
          <p className="text-[18px] font-medium text-[#252525]">
            KMI의 혜택을 하나의 아이디로 이용하세요.
          </p>
          <Link
            href={signupHref}
            className="flex h-[44px] w-full items-center justify-center gap-1 rounded-[3px] bg-[#3b82f6] text-[16px] font-bold text-white"
          >
            통합 회원가입
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </Link>
        </div>

        {/* 구분선 */}
        <hr className="border-t border-[#e3e3e3]" />

        {/* 소셜 로그인 4종 (Apple → Facebook 대체) */}
        <div className="mt-[30px] grid grid-cols-4 gap-2">
          <SocialButton label="카카오 로그인" onClick={handleKakao} disabled={isLoading}>
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#FEE500]">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="#3C1E1E" aria-hidden="true">
                <path d="M12 4C7 4 3 7.1 3 11c0 2.5 1.7 4.7 4.2 5.9-.2.6-.7 2.3-.8 2.7 0 .2.1.4.4.2.2-.1 2.6-1.8 3.6-2.5.5.1 1 .1 1.6.1 5 0 9-3.1 9-7s-4-7-9-7Z" />
              </svg>
            </span>
          </SocialButton>
          <SocialButton label="네이버 로그인" onClick={handleNaver} disabled={isLoading}>
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#03C75A]">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
                <path d="M15.2 12.4 8.6 3H4v18h4.8v-9.4L15.4 21H20V3h-4.8v9.4Z" />
              </svg>
            </span>
          </SocialButton>
          <SocialButton label="구글 로그인" onClick={handleGoogle} disabled={isLoading}>
            <span className="flex h-20 w-20 items-center justify-center rounded-full border border-[#e3e3e3] bg-white">
              <svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M21.6 12.2c0-.6-.1-1.2-.2-1.8H12v3.4h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.1Z" />
                <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.7-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z" />
                <path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14Z" />
                <path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.4 3-4.1 5.6-4.1Z" />
              </svg>
            </span>
          </SocialButton>
          <SocialButton label="페이스북 로그인" onClick={handleFacebook} disabled={isLoading}>
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#1877F2]">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
                <path d="M14 9V7c0-.8.2-1.3 1.4-1.3H17V2.6c-.4-.1-1.4-.2-2.5-.2-2.5 0-4.1 1.5-4.1 4.2V9H8v3h2.4v9H14v-9h2.5l.4-3H14Z" />
              </svg>
            </span>
          </SocialButton>
        </div>
      </div>
    </div>
  );
}

// 소셜 로그인 버튼: 80x80 아이콘 + 15px 라벨. variant는 children(아이콘)으로 주입.
function SocialButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
      <span className="text-[15px] text-[#252525]">{label}</span>
    </button>
  );
}
