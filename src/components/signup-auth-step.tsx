"use client";

import { useState } from "react";
import { signInWithGoogle } from "@/lib/firebase-google-auth";
import { startKakaoLogin } from "@/lib/firebase-kakao-auth";
import { startNaverLogin } from "@/lib/firebase-naver-auth";
import { signInWithFacebook } from "@/lib/firebase-facebook-auth";

// 회원가입 1단계: 가입 방식 선택. 소셜은 OAuth로 신원을 확인하고,
// 이메일은 다음 단계(약관 → 정보입력)에서 계정을 만든다.
// 구글/페이스북은 popup이라 성공 시 즉시 onSocialAuthenticated로 다음 단계 진행.
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

  async function handleFacebook() {
    setState({ kind: "loading" });
    const result = await signInWithFacebook();
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
    <div>
      <h1 className="text-center text-[23px] font-bold leading-[1.3] text-[#252525]">
        서울체육예약 회원으로 가입해 주세요.
      </h1>
      <p className="mt-4 text-center text-[18px] font-medium leading-[1.4] text-[#252525]">
        회원가입하면 체육시설 예약과 이용 내역 관리 등
        <br />
        모든 서비스를 하나의 계정으로 이용할 수 있습니다.
      </p>
      <p className="mt-3 text-center text-[14px] text-[#9b9b9b]">
        만 14세 이상부터 가입 가능합니다.
      </p>

      {/* 캐릭터 이미지 placeholder 160 x 159.5 */}
      <div className="mx-auto mt-8 flex h-[159.5px] w-40 items-center justify-center rounded-full bg-[#e8eefb] text-xs text-accent">
        캐릭터
      </div>

      {/* 구분선 */}
      <hr className="mt-10 border-t border-[#e3e3e3]" />

      <h2 className="mt-8 text-center text-[20px] font-bold text-[#252525]">
        회원가입 인증 방식을 선택해 주세요.
      </h2>

      <div className="mt-7 grid grid-cols-5 gap-2">
        {/* 휴대폰 본인인증 → 이메일 간편가입 */}
        <AuthCircle label={"이메일\n간편 가입"} onClick={onSelectEmail} disabled={isLoading}>
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#3b82f6]">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
          </span>
        </AuthCircle>

        <AuthCircle label={"카카오\n간편 가입"} onClick={handleKakao} disabled={isLoading}>
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#FEE500]">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="#3C1E1E" aria-hidden="true">
              <path d="M12 4C7 4 3 7.1 3 11c0 2.5 1.7 4.7 4.2 5.9-.2.6-.7 2.3-.8 2.7 0 .2.1.4.4.2.2-.1 2.6-1.8 3.6-2.5.5.1 1 .1 1.6.1 5 0 9-3.1 9-7s-4-7-9-7Z" />
            </svg>
          </span>
        </AuthCircle>

        <AuthCircle label={"네이버\n간편 가입"} onClick={handleNaver} disabled={isLoading}>
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#03C75A]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
              <path d="M15.2 12.4 8.6 3H4v18h4.8v-9.4L15.4 21H20V3h-4.8v9.4Z" />
            </svg>
          </span>
        </AuthCircle>

        <AuthCircle label={"구글\n간편 가입"} onClick={handleGoogle} disabled={isLoading}>
          <span className="flex h-20 w-20 items-center justify-center rounded-full border border-[#e3e3e3] bg-white">
            <svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M21.6 12.2c0-.6-.1-1.2-.2-1.8H12v3.4h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.1Z" />
              <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.7-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z" />
              <path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14Z" />
              <path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.4 3-4.1 5.6-4.1Z" />
            </svg>
          </span>
        </AuthCircle>

        {/* Apple → 페이스북 (login과 일관) */}
        <AuthCircle label={"페이스북\n간편 가입"} onClick={handleFacebook} disabled={isLoading}>
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#1877F2]">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
              <path d="M14 9V7c0-.8.2-1.3 1.4-1.3H17V2.6c-.4-.1-1.4-.2-2.5-.2-2.5 0-4.1 1.5-4.1 4.2V9H8v3h2.4v9H14v-9h2.5l.4-3H14Z" />
            </svg>
          </span>
        </AuthCircle>
      </div>

      {state.kind === "error" ? (
        <p
          className="mt-5 rounded-[3px] border border-error/30 bg-error/10 px-3 py-2 text-sm text-error"
          role="alert"
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

// 인증 방식 원형 버튼: 58x58 아이콘 원 + 2줄 라벨(13~14px).
function AuthCircle({
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
      <span className="whitespace-pre-line text-center text-[14px] leading-tight text-[#252525]">
        {label}
      </span>
    </button>
  );
}
