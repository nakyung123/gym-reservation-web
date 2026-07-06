"use client";

import Image from "next/image";
import { useState } from "react";
import { KakaoIcon, NaverIcon, GoogleIcon, FacebookIcon, MailIcon } from "@/components/social-icons";
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
        체육시설 예약과 이용 내역 관리를
        <br />
        간편하게 시작해 보세요.
      </p>
      <p className="mt-3 text-center text-[16px] text-[#9b9b9b]">
        만 14세 이상부터 가입 가능합니다.
      </p>

      {/* 캐릭터 이미지 200 x 200 (정사각형) */}
      <div className="mx-auto mt-8 flex h-[200px] w-[200px] items-center justify-center">
        <Image
          src="/signup-character.png"
          alt="서울체육예약 캐릭터"
          width={200}
          height={200}
          className="h-[200px] w-[200px] object-contain"
        />
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
            <MailIcon />
          </span>
        </AuthCircle>

        <AuthCircle label={"카카오\n간편 가입"} onClick={handleKakao} disabled={isLoading}>
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#FEE500]">
            <KakaoIcon />
          </span>
        </AuthCircle>

        <AuthCircle label={"네이버\n간편 가입"} onClick={handleNaver} disabled={isLoading}>
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#03C75A]">
            <NaverIcon />
          </span>
        </AuthCircle>

        <AuthCircle label={"구글\n간편 가입"} onClick={handleGoogle} disabled={isLoading}>
          <span className="flex h-20 w-20 items-center justify-center rounded-full border border-[#e3e3e3] bg-white">
            <GoogleIcon />
          </span>
        </AuthCircle>

        {/* Apple → 페이스북 (login과 일관) */}
        <AuthCircle label={"페이스북\n간편 가입"} onClick={handleFacebook} disabled={isLoading}>
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#1877F2]">
            <FacebookIcon />
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
