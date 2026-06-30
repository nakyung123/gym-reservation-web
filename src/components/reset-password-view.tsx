"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendPasswordReset } from "@/lib/firebase-email-auth";
import { FindAccountHeader } from "@/components/find-account-header";

// 아이디/비밀번호 찾기 1단계: 이메일로 본인 확인 링크를 보낸다.
// 휴대폰 본인인증 미연동이라 이메일 링크 방식으로 대체한다.
// 보낸 뒤에는 성공/실패 무관하게 동일 안내(email enumeration 방어).

type SubmitState = { kind: "idle" } | { kind: "loading" } | { kind: "sent" };

export function ResetPasswordView() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitState({ kind: "loading" });
    await sendPasswordReset(email.trim());
    setSubmitState({ kind: "sent" });
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-white">
      <FindAccountHeader onClose={() => router.back()} />

      <div className="mx-auto w-full max-w-[520px] px-5 pb-10 pt-12">
        {/* 아이콘 */}
        <div className="mx-auto flex size-[120px] items-center justify-center rounded-full bg-[#e8eefb]">
          <svg width="56" height="56" viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <rect x="6" y="10" width="24" height="30" rx="4" fill="#3b82f6" />
            <circle cx="18" cy="20" r="4" fill="#fff" />
            <path d="M12 32c0-3.3 2.7-6 6-6s6 2.7 6 6" fill="#fff" />
            <circle cx="35" cy="24" r="6" fill="none" stroke="#9db4ff" strokeWidth="3" />
            <path d="M35 30v8m0-3h4" stroke="#9db4ff" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>

        {submitState.kind === "sent" ? (
          <>
            <h1 className="mt-8 text-center text-[22px] font-bold leading-[1.4] text-[#252525]">
              인증 메일을 보냈습니다.
            </h1>
            <p className="mt-4 text-center text-[15px] leading-[1.6] text-[#777]">
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
            <h1 className="mt-8 text-center text-[22px] font-bold leading-[1.4] text-[#252525]">
              이메일 인증을 통해
              <br />
              아이디와 비밀번호를 확인하실 수 있습니다.
            </h1>
            <p className="mt-4 text-center text-[15px] leading-[1.6] text-[#777]">
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
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
