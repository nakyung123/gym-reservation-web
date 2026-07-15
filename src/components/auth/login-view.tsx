"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AlertModal } from "@/components/ui/alert-modal";
import { KakaoIcon, NaverIcon, GoogleIcon, FacebookIcon } from "@/components/ui/social-icons";
import { signInWithEmail } from "@/lib/firebase-email-auth";
import { signInWithLoginId } from "@/lib/firebase-login-id-auth";
import { signInWithGoogle } from "@/lib/firebase-google-auth";
import { startKakaoLogin } from "@/lib/firebase-kakao-auth";
import { startNaverLogin } from "@/lib/firebase-naver-auth";
import { signInWithFacebook } from "@/lib/firebase-facebook-auth";
import { OAUTH_FROM_STORAGE_KEY, sanitizeFromPath } from "@/lib/use-require-auth";
import { fetchUserProfile } from "@/lib/user-profile-client";
import { getFirebaseClient } from "@/lib/firebase-client";
import { signOut } from "firebase/auth";
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
  // 통일 알림창 메시지(빈 입력·로그인 실패 안내). null이면 닫힘.
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  // 소셜/이메일 로그인 처리 중에는 이 effect의 자동 redirect를 막는다.
  // (인증 성공으로 session.ok가 되는 순간, 가입여부 확인 전에 effect가 먼저 redirect하면
  //  미가입 계정이 그대로 로그인되어 버리는 경합을 방지.)
  const verifyingRef = useRef(false);

  // 이미 로그인되어 있으면 from으로 즉시 redirect(처리 중이 아닐 때만).
  useEffect(() => {
    if (session.ok && !verifyingRef.current) {
      router.replace(fromPath);
    }
  }, [session, fromPath, router]);

  const isFormValid = identifier.length > 0 && password.length > 0;

  // 로그인은 계정을 '생성'하지 않는다. 인증에 성공해도 가입이 완료된 계정(loginId 설정됨)이
  // 아니면 로그아웃하고 회원가입을 먼저 하도록 안내한다. (탈퇴 후 재로그인이나 미가입 소셜
  // 계정이 빈 상태로 로그인되던 문제 방지 — 프로필을 여기서 새로 만들지 않는다.)
  async function verifyRegisteredOrBlock(): Promise<boolean> {
    let profile: Awaited<ReturnType<typeof fetchUserProfile>> | null = null;
    try {
      profile = await fetchUserProfile();
    } catch {
      profile = null;
    }
    if (profile && profile.ok && profile.profile && profile.profile.loginId) {
      return true;
    }
    try {
      const { auth } = getFirebaseClient();
      await signOut(auth);
    } catch {
      // 세션 정리 실패는 무시(다시 로그인/가입 시 세션이 교체된다).
    }
    verifyingRef.current = false;
    setSubmitState({ kind: "idle" });
    setAlertMessage("가입된 계정이 아닙니다. 회원가입을 먼저 진행해 주세요.");
    return false;
  }

  async function handleEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // 버튼은 항상 활성화돼 있으므로, 빈 입력이면 알림창으로 안내한다.
    if (!isFormValid) {
      setAlertMessage("아이디 또는 비밀번호를 입력하세요.");
      return;
    }
    verifyingRef.current = true;
    setSubmitState({ kind: "loading" });
    const trimmed = identifier.trim();
    // '@' 포함 = 이메일 로그인, 그 외 = 아이디 로그인(서버에서 이메일로 변환).
    const result = looksLikeEmail(trimmed)
      ? await signInWithEmail({ email: trimmed, password })
      : await signInWithLoginId({ loginId: trimmed, password });
    if (result.ok) {
      if (!(await verifyRegisteredOrBlock())) return;
      router.replace(fromPath);
      return;
    }
    // 계정/비밀번호 오류는 어떤 필드가 틀렸는지 노출하지 않고 통일 문구로 안내한다.
    verifyingRef.current = false;
    setSubmitState({ kind: "idle" });
    setAlertMessage("아이디 또는 비밀번호가 올바르지 않습니다.");
  }

  async function handleGoogle() {
    verifyingRef.current = true;
    setSubmitState({ kind: "loading" });
    const result = await signInWithGoogle();
    if (result.ok) {
      if (!(await verifyRegisteredOrBlock())) return;
      router.replace(fromPath);
      return;
    }
    if (result.cancelled) {
      verifyingRef.current = false;
      setSubmitState({ kind: "idle" });
      return;
    }
    verifyingRef.current = false;
    setSubmitState({ kind: "idle" });
    setAlertMessage(result.message);
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
      setSubmitState({ kind: "idle" });
      setAlertMessage(result.message);
    }
  }

  async function handleNaver() {
    setSubmitState({ kind: "loading" });
    persistOauthFromPath();
    const result = await startNaverLogin();
    if (!result.ok) {
      setSubmitState({ kind: "idle" });
      setAlertMessage(result.message);
    }
  }

  async function handleFacebook() {
    verifyingRef.current = true;
    setSubmitState({ kind: "loading" });
    const result = await signInWithFacebook();
    if (result.ok) {
      if (!(await verifyRegisteredOrBlock())) return;
      router.replace(fromPath);
      return;
    }
    if (result.cancelled) {
      verifyingRef.current = false;
      setSubmitState({ kind: "idle" });
      return;
    }
    verifyingRef.current = false;
    setSubmitState({ kind: "idle" });
    setAlertMessage(result.message);
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
            onClick={() => router.push("/")}
            aria-label="홈으로"
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
          <span className="text-[22px] font-bold leading-none tracking-[-0.01em] text-[#252525]">
            서울체육예약 로그인
          </span>
        </div>
      </header>

      {/* 본문: 가운데 컬럼. 캐릭터 상단이 페이지 최상단에서 약 100px(헤더 61 + pt 39)에 오게 한다. */}
      <div className="mx-auto w-full max-w-[520px] px-5 pb-6 pt-[39px]">
        {/* 캐릭터 이미지 160 x 159.5 */}
        <div className="mx-auto flex h-[159.5px] w-40 items-center justify-center">
          <Image
            src="/login-character.png"
            alt="서울체육예약 캐릭터"
            width={160}
            height={160}
            priority
            className="h-[159.5px] w-40 object-contain"
          />
        </div>

        <h1 className="mt-4 text-center text-[23px] font-bold leading-[1.3] text-[#252525]">
          서울체육예약 아이디로 로그인해 주세요.
        </h1>

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

          <div className="mt-5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setRememberId((v) => !v)}
              className="flex items-center gap-2 text-[15px] text-[#252525]"
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full ${
                  rememberId
                    ? "bg-accent text-white"
                    : "bg-[#e3e3e3] text-white"
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

          {/* 버튼은 항상 활성화. 빈 입력/오류는 알림창으로 안내한다. */}
          <button
            type="submit"
            disabled={isLoading}
            className="mt-5 h-[60px] w-full rounded-[3px] bg-[#121212] text-[18px] font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-90"
          >
            {isLoading ? "로그인 중…" : "로그인"}
          </button>
        </form>

        {/* 회원가입 안내 — 회원가입 버튼은 로그인 버튼과 동일 크기(h-60, 18px). */}
        <div className="flex flex-col items-center gap-3 pt-4">
          <p className="text-[18px] font-medium text-[#252525]">
            아직 서울체육예약 회원이 아니신가요?
          </p>
          <Link
            href={signupHref}
            className="flex h-[60px] w-full items-center justify-center rounded-[3px] bg-[#3b82f6] text-[18px] font-medium text-white"
          >
            회원가입
          </Link>
        </div>

        {/* 구분선 — 위·아래 간격 동일(my-8, 32px). */}
        <hr className="my-8 border-t border-[#e3e3e3]" />

        {/* 소셜 로그인 4종 (Apple → Facebook 대체) */}
        <div className="grid grid-cols-4 gap-2">
          <SocialButton label="카카오 로그인" onClick={handleKakao} disabled={isLoading}>
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#FEE500]">
              <KakaoIcon />
            </span>
          </SocialButton>
          <SocialButton label="네이버 로그인" onClick={handleNaver} disabled={isLoading}>
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#03C75A]">
              <NaverIcon />
            </span>
          </SocialButton>
          <SocialButton label="구글 로그인" onClick={handleGoogle} disabled={isLoading}>
            <span className="flex h-20 w-20 items-center justify-center rounded-full border border-[#e3e3e3] bg-white">
              <GoogleIcon />
            </span>
          </SocialButton>
          <SocialButton label="페이스북 로그인" onClick={handleFacebook} disabled={isLoading}>
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#1877F2]">
              <FacebookIcon />
            </span>
          </SocialButton>
        </div>
      </div>

      {/* 통일 알림창(빈 입력·로그인 실패 안내) */}
      {alertMessage ? (
        <AlertModal message={alertMessage} onClose={() => setAlertMessage(null)} />
      ) : null}
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
