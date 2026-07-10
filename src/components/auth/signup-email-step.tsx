"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlertModal } from "@/components/ui/alert-modal";
import { checkEmailAvailability } from "@/lib/email-availability-client";
import { sendSignupEmailLink } from "@/lib/firebase-email-auth";

// 회원가입 '본인 인증'(이메일) 단계. 이메일 간편가입을 고르면 가장 먼저 나오는 화면.
// '인증 메일 보내기'를 누르면 중복 여부를 확인한 뒤 실제 인증 링크를 발송한다(가입 전 인증).
//  - 이미 가입된 이메일(비밀번호·소셜 모두 포함)이면 알림창 → 확인 시 로그인 화면으로 이동한다.
//  - 새 이메일이면 링크를 발송하고 '메일 확인 대기' 화면을 보여준다. 링크를 클릭하기 전에는
//    다음 단계로 넘어갈 수 없다. 같은 브라우저에서 링크를 열면 세션이 로그인되므로
//    sessionReady로 감지해 onVerified로 진행하고, 링크를 연 탭/기기에서는 SignupView가
//    복귀를 직접 처리한다.

// 간단한 이메일 형식 검사(로컬@도메인.tld). 서버 검증 이전 사용자 안내용.
function isEmailFormat(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// 재발송 연타로 인한 Firebase rate limit을 피하기 위한 최소 간격.
const RESEND_COOLDOWN_SECONDS = 60;

// 알림창 상태. toLogin이면 확인 시 로그인 화면으로 이동한다(이미 가입된 이메일 안내).
type AlertState = { message: string; toLogin?: boolean };

type Phase = "input" | "sent";

export function SignupEmailStep({
  initialEmail,
  sessionReady,
  onVerified,
}: {
  initialEmail?: string;
  // 인증 링크 클릭으로 이 브라우저가 로그인되면 true가 된다(SignupView의 세션 구독).
  sessionReady: boolean;
  onVerified: () => void;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail ?? "");
  const [phase, setPhase] = useState<Phase>("input");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [alert, setAlert] = useState<AlertState | null>(null);
  const verifiedFiredRef = useRef(false);

  // 대기 화면에서 다른 탭의 링크 클릭으로 세션이 로그인되면 다음 단계로 진행한다.
  useEffect(() => {
    if (phase !== "sent" || !sessionReady || verifiedFiredRef.current) return;
    verifiedFiredRef.current = true;
    onVerified();
  }, [phase, sessionReady, onVerified]);

  // 재발송 쿨다운 카운트다운.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  // 중복 확인 → 인증 링크 발송. 발송 성공 시에만 대기 화면으로 전환한다.
  async function sendLink(targetEmail: string) {
    setBusy(true);

    const availability = await checkEmailAvailability(targetEmail);
    if (!availability.ok) {
      setBusy(false);
      setAlert({ message: availability.message });
      return;
    }
    if (!availability.available) {
      setBusy(false);
      if (availability.reason === "invalid") {
        setAlert({ message: "이메일 형식이 올바르지 않습니다." });
        return;
      }
      // 이미 가입된 이메일 → 로그인 유도.
      setAlert({
        message: "이미 가입된 이메일입니다. 로그인 후 이용해 주세요.",
        toLogin: true,
      });
      return;
    }

    const sent = await sendSignupEmailLink(targetEmail);
    setBusy(false);
    if (!sent.ok) {
      setAlert({ message: sent.message });
      return;
    }
    setPhase("sent");
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const trimmed = email.trim();
    if (trimmed.length === 0) {
      setAlert({ message: "이메일을 입력해 주세요." });
      return;
    }
    if (!isEmailFormat(trimmed)) {
      setAlert({ message: "이메일 형식이 올바르지 않습니다." });
      return;
    }
    await sendLink(trimmed);
  }

  async function handleResend() {
    if (busy || cooldown > 0) return;
    await sendLink(email.trim());
  }

  // 알림창 닫기: 이미 가입 안내면 로그인 화면으로, 그 외엔 단순 닫기.
  function handleAlertClose() {
    if (alert?.toLogin) {
      router.push("/login");
      return;
    }
    setAlert(null);
  }

  return (
    <div>
      {/* 캐릭터 이미지 160 x 160 */}
      <div className="mx-auto flex h-40 w-40 items-center justify-center">
        <Image
          src="/signup-character.png"
          alt="서울체육예약 캐릭터"
          width={160}
          height={160}
          priority
          className="h-40 w-40 object-contain"
        />
      </div>

      {phase === "input" ? (
        <>
          <h1 className="mt-6 text-center text-[23px] font-bold leading-[1.4] text-[#252525]">
            가입에 사용할 이메일을
            <br />
            입력해 주세요.
          </h1>
          <p className="mt-4 text-center text-[18px] leading-[1.6] text-[#252525]">
            입력한 이메일로 인증 링크를 보내드립니다.
            <br />
            링크를 눌러 인증을 완료하면 가입이 이어집니다.
          </p>

          <form className="mt-8" onSubmit={handleSubmit} noValidate>
            <input
              type="email"
              autoComplete="email"
              placeholder="이메일을 입력해 주세요."
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-[50px] w-full rounded-[3px] border border-[#d0d0d0] px-3 text-[15px] text-[#252525] placeholder:text-[#bdbdbd] focus:border-accent focus:outline-none"
            />

            {/* 인증 메일 보내기 — 찾기 화면과 동일하게 단일 버튼(화살표 없음). */}
            <button
              type="submit"
              disabled={busy}
              className="mt-6 h-[56px] w-full rounded-[3px] bg-[#121212] text-[17px] font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-90"
            >
              {busy ? "보내는 중…" : "인증 메일 보내기"}
            </button>
          </form>
        </>
      ) : (
        <>
          <h1 className="mt-6 text-center text-[23px] font-bold leading-[1.4] text-[#252525]">
            인증 메일을 보냈습니다.
          </h1>
          <p className="mt-4 text-center text-[18px] leading-[1.6] text-[#252525]">
            <span className="font-medium">{email.trim()}</span>
            <br />
            메일함에서 인증 링크를 눌러 주세요.
          </p>
          <p
            className="mt-4 text-center text-[15px] leading-[1.6] text-[#9b9b9b]"
            aria-live="polite"
            aria-busy="true"
          >
            링크를 누르면 가입이 자동으로 이어집니다.
            <br />
            다른 기기에서 링크를 열면 그 기기에서 가입이 진행됩니다.
          </p>

          <div className="mt-8 flex flex-col gap-3">
            <button
              type="button"
              onClick={handleResend}
              disabled={busy || cooldown > 0}
              className="h-[56px] w-full rounded-[3px] bg-[#121212] text-[17px] font-medium text-white transition disabled:cursor-not-allowed disabled:bg-[#f1f1f1] disabled:text-[#9b9b9b]"
            >
              {busy
                ? "보내는 중…"
                : cooldown > 0
                  ? `인증 메일 다시 보내기 (${cooldown}초)`
                  : "인증 메일 다시 보내기"}
            </button>
            <button
              type="button"
              onClick={() => setPhase("input")}
              disabled={busy}
              className="h-[56px] w-full rounded-[3px] border border-[#d0d0d0] bg-white text-[17px] font-medium text-[#252525] disabled:cursor-not-allowed disabled:opacity-60"
            >
              이메일 변경
            </button>
          </div>
        </>
      )}

      {/* 통일 알림창(빈 값·형식 오류·이미 가입 안내·발송 실패) */}
      {alert ? (
        <AlertModal message={alert.message} onClose={handleAlertClose} />
      ) : null}
    </div>
  );
}
