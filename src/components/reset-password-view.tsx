"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendPasswordReset } from "@/lib/firebase-email-auth";
import { FindAccountHeader } from "@/components/find-account-header";
import { AlertModal } from "@/components/alert-modal";

// 간단한 이메일 형식 검사(로컬@도메인.tld). 서버 검증 이전 사용자 안내용.
function isEmailFormat(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// 아이디/비밀번호 찾기 1단계: 이메일로 본인 확인 링크를 보낸다.
// 휴대폰 본인인증 미연동이라 이메일 링크 방식으로 대체한다.
// 보낸 뒤에는 성공/실패 무관하게 동일 안내(email enumeration 방어).

type SubmitState = { kind: "idle" } | { kind: "loading" } | { kind: "sent" };

export function ResetPasswordView() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  // X 닫기 시 이탈 확인 알림창. 완료(sent) 화면에서는 헤더 X를 숨기므로 진행 중에만 뜬다.
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = email.trim();
    // 메일 형식이 아니면 알림창으로 안내한다.
    if (!isEmailFormat(trimmed)) {
      setAlertMessage("이메일 형식이 올바르지 않습니다.");
      return;
    }
    setSubmitState({ kind: "loading" });
    await sendPasswordReset(trimmed);
    setSubmitState({ kind: "sent" });
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-white">
      <FindAccountHeader onClose={() => setShowExitConfirm(true)} />

      <div className="mx-auto w-full max-w-[520px] px-5 pb-10 pt-12">
        {/* 아이콘 이미지 130 x 130 */}
        <div className="mx-auto flex size-[130px] items-center justify-center">
          <Image
            src="/find-account.png"
            alt="아이디/비밀번호 찾기"
            width={130}
            height={130}
            priority
            className="size-[130px] object-contain"
          />
        </div>

        {submitState.kind === "sent" ? (
          <>
            <h1 className="mt-8 text-center text-[23px] font-bold leading-[1.4] text-[#252525]">
              인증 메일을 보냈습니다.
            </h1>
            <p className="mt-4 text-center text-[18px] leading-[1.6] text-[#252525]">
              입력하신 이메일이 가입된 계정이라면 인증 링크가 발송됩니다.
              <br />
              메일의 링크에서 아이디 확인과 비밀번호 재설정을
              <br />
              진행할 수 있습니다.
            </p>
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="mt-9 h-[60px] w-full rounded-[3px] bg-[#121212] text-[18px] font-medium text-white"
            >
              로그인으로 돌아가기
            </button>
          </>
        ) : (
          <>
            <h1 className="mt-8 text-center text-[23px] font-bold leading-[1.4] text-[#252525]">
              이메일 인증을 통해
              <br />
              아이디와 비밀번호를 확인하실 수 있습니다.
            </h1>
            <p className="mt-4 text-center text-[18px] leading-[1.6] text-[#252525]">
              가입하신 이메일로 인증 링크를 보내드립니다.
              <br />
              메일의 링크에서 아이디 확인과 비밀번호 재설정을
              <br />
              진행할 수 있습니다.
            </p>

            <form className="mt-8" onSubmit={handleSubmit} noValidate>
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="가입하신 이메일을 입력해 주세요."
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-[50px] w-full rounded-[3px] border border-[#d0d0d0] px-3 text-[15px] text-[#252525] placeholder:text-[#bdbdbd] focus:border-accent focus:outline-none"
              />
              <button
                type="submit"
                disabled={submitState.kind === "loading" || !email.trim()}
                className="mt-4 flex h-[60px] w-full items-center justify-center gap-2 rounded-[3px] bg-[#121212] text-[18px] font-medium text-white disabled:cursor-not-allowed disabled:bg-[#a0a0a0]"
              >
                {submitState.kind === "loading" ? "보내는 중…" : "인증 메일 보내기"}
              </button>
            </form>
          </>
        )}
      </div>

      {/* 통일 알림창(이메일 형식 오류 안내) */}
      {alertMessage ? (
        <AlertModal message={alertMessage} onClose={() => setAlertMessage(null)} />
      ) : null}

      {/* 이탈 확인 알림창 — 확인 시 로그인 화면으로 이동 */}
      {showExitConfirm ? (
        <AlertModal
          message="아이디/비밀번호 찾기를 멈추고 로그인 화면으로 돌아가시겠습니까?"
          onClose={() => setShowExitConfirm(false)}
          confirm={{
            confirmLabel: "돌아가기",
            onConfirm: () => router.push("/login"),
          }}
        />
      ) : null}
    </div>
  );
}
