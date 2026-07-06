"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertModal } from "@/components/alert-modal";
import { checkEmailAvailability } from "@/lib/email-availability-client";

// 회원가입 '본인 인증'(이메일) 단계. 이메일 간편가입을 고르면 가장 먼저 나오는 화면으로,
// 아이디/비밀번호 찾기 화면과 같은 레이아웃(캐릭터 + 안내 + 이메일 입력 + 인증 메일 보내기)을 쓴다.
// '인증 메일 보내기'를 누르면 이메일 중복 여부를 먼저 확인한다.
//  - 이미 가입된 이메일(비밀번호·소셜 모두 포함)이면 알림창 → 확인 시 로그인 화면으로 이동한다.
//  - 새 이메일이면 다음 단계로 넘긴다. 실제 인증 메일은 계정 생성 시(정보 입력 완료) 발송된다.
//    (Firebase는 계정 생성 전 인증 메일을 보낼 수 없다.) 입력한 이메일은 이후 단계로 넘겨 잠근다.

// 간단한 이메일 형식 검사(로컬@도메인.tld). 서버 검증 이전 사용자 안내용.
function isEmailFormat(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// 알림창 상태. toLogin이면 확인 시 로그인 화면으로 이동한다(이미 가입된 이메일 안내).
type AlertState = { message: string; toLogin?: boolean };

export function SignupEmailStep({
  initialEmail,
  onNext,
}: {
  initialEmail?: string;
  onNext: (email: string) => void;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail ?? "");
  const [checking, setChecking] = useState(false);
  const [alert, setAlert] = useState<AlertState | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (checking) return;
    const trimmed = email.trim();
    if (trimmed.length === 0) {
      setAlert({ message: "이메일을 입력해 주세요." });
      return;
    }
    if (!isEmailFormat(trimmed)) {
      setAlert({ message: "이메일 형식이 올바르지 않습니다." });
      return;
    }

    // 이미 가입된 이메일인지 확인(비밀번호·소셜 계정 모두 포함).
    setChecking(true);
    const result = await checkEmailAvailability(trimmed);
    setChecking(false);

    if (!result.ok) {
      setAlert({ message: result.message });
      return;
    }
    if (!result.available) {
      if (result.reason === "invalid") {
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

    onNext(trimmed);
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
          className="h-40 w-40 object-contain"
        />
      </div>

      <h1 className="mt-6 text-center text-[23px] font-bold leading-[1.4] text-[#252525]">
        가입에 사용할 이메일을
        <br />
        입력해 주세요.
      </h1>
      <p className="mt-4 text-center text-[18px] leading-[1.6] text-[#252525]">
        이 이메일로 로그인하고 인증 메일을 받게 됩니다.
        <br />
        가입 후 메일함에서 인증을 완료해 주세요.
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
          disabled={checking}
          className="mt-6 h-[56px] w-full rounded-[3px] bg-[#121212] text-[17px] font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-90"
        >
          {checking ? "확인 중…" : "인증 메일 보내기"}
        </button>
      </form>

      {/* 통일 알림창(빈 값·형식 오류·이미 가입 안내) */}
      {alert ? (
        <AlertModal message={alert.message} onClose={handleAlertClose} />
      ) : null}
    </div>
  );
}
