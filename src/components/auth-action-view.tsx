"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  applyActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode,
} from "firebase/auth";
import { getFirebaseClient } from "@/lib/firebase-client";
import { fetchLoginIdByResetCode } from "@/lib/find-account-client";
import { validatePasswordPolicy } from "@/lib/password-policy";
import { FindAccountHeader } from "@/components/find-account-header";

// Firebase 이메일 작업(action) 핸들러. 비밀번호 재설정 메일과 이메일 인증 메일의 링크가
// 모두 이 페이지로 온다(Firebase 콘솔에서 작업 URL을 이 경로로 지정해야 활성화됨).
//   mode=resetPassword: oobCode 검증 → 아이디 표시 → 새 비밀번호 설정 → 완료.
//   mode=verifyEmail:   oobCode 적용(applyActionCode) → 인증 완료 안내.
// oobCode가 만료/무효면 명시적 오류 화면을 보여준다(말없는 fallback 금지).

type Phase =
  | { kind: "verifying" }
  | { kind: "reset-form"; email: string; loginId: string | null }
  | { kind: "reset-submitting"; email: string; loginId: string | null }
  | { kind: "done" }
  | { kind: "verify-success" }
  | { kind: "error"; message: string };

export function AuthActionView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") ?? "";
  const oobCode = searchParams.get("oobCode") ?? "";

  const [phase, setPhase] = useState<Phase>({ kind: "verifying" });
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const startedRef = useRef(false);

  // 진입 시 1회: oobCode를 검증/적용한다.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    void (async () => {
      if (!oobCode) {
        setPhase({
          kind: "error",
          message: "유효하지 않은 접근입니다. 메일의 링크로 다시 시도해 주세요.",
        });
        return;
      }

      const { auth } = getFirebaseClient();
      try {
        if (mode === "verifyEmail") {
          await applyActionCode(auth, oobCode);
          setPhase({ kind: "verify-success" });
          return;
        }
        if (mode === "resetPassword") {
          const email = await verifyPasswordResetCode(auth, oobCode);
          // 서버가 oobCode를 직접 재검증해 본인 계정의 아이디만 돌려준다(이메일 노출/타인 조회 차단).
          const result = await fetchLoginIdByResetCode(oobCode);
          const loginId = result.ok ? result.loginId : null;
          setPhase({ kind: "reset-form", email, loginId });
          return;
        }
        setPhase({ kind: "error", message: "지원하지 않는 요청입니다." });
      } catch {
        setPhase({
          kind: "error",
          message: "링크가 만료되었거나 이미 사용되었습니다. 처음부터 다시 시도해 주세요.",
        });
      }
    })();
  }, [mode, oobCode]);

  const passwordError = validatePasswordPolicy(password);
  const passwordConfirmError =
    passwordConfirm.length > 0 && passwordConfirm !== password
      ? "비밀번호가 일치하지 않습니다."
      : null;
  const canSubmit =
    password.length > 0 &&
    passwordConfirm.length > 0 &&
    !passwordError &&
    !passwordConfirmError;

  const pwRules = [
    { label: "8자 이상", ok: password.length >= 8 },
    { label: "영문 소문자 포함", ok: /[a-z]/.test(password) },
    { label: "숫자 포함", ok: /[0-9]/.test(password) },
    { label: "특수문자 포함", ok: /[^A-Za-z0-9]/.test(password) },
  ];

  async function handleResetSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (phase.kind !== "reset-form" || !canSubmit) return;
    setSubmitError(null);
    const { email, loginId } = phase;
    setPhase({ kind: "reset-submitting", email, loginId });
    try {
      const { auth } = getFirebaseClient();
      await confirmPasswordReset(auth, oobCode, password);
      setPhase({ kind: "done" });
    } catch (error) {
      const code = (error as { code?: string }).code ?? "";
      const message =
        code === "auth/expired-action-code" || code === "auth/invalid-action-code"
          ? "링크가 만료되었거나 이미 사용되었습니다. 처음부터 다시 시도해 주세요."
          : code === "auth/weak-password" ||
              code === "auth/password-does-not-meet-requirements"
            ? "비밀번호가 약합니다. 8자 이상이며 영문 소문자·숫자·특수문자를 포함해 주세요."
            : "비밀번호 변경에 실패했습니다. 다시 시도해 주세요.";
      setSubmitError(message);
      setPhase({ kind: "reset-form", email, loginId });
    }
  }

  const showClose = phase.kind !== "done" && phase.kind !== "verify-success";

  return (
    <div className="flex min-h-screen w-full flex-col bg-white">
      <FindAccountHeader onClose={showClose ? () => router.push("/login") : undefined} />

      <div className="mx-auto w-full max-w-[520px] px-5 pb-10 pt-12">
        {phase.kind === "verifying" ? (
          <p className="mt-10 text-center text-[15px] text-[#777]">확인하는 중입니다…</p>
        ) : null}

        {phase.kind === "error" ? (
          <>
            <p className="mt-10 text-center text-[17px] font-bold text-[#252525]">
              요청을 처리할 수 없습니다.
            </p>
            <p className="mt-3 text-center text-[15px] leading-[1.6] text-[#777]">
              {phase.message}
            </p>
            <button
              type="button"
              onClick={() => router.push("/reset-password")}
              className="mt-9 h-[60px] w-full rounded-[3px] bg-[#121212] text-[18px] font-medium text-white"
            >
              다시 시도하기
            </button>
          </>
        ) : null}

        {phase.kind === "verify-success" ? (
          <>
            <CharacterPlaceholder />
            <h1 className="mt-6 text-center text-[22px] font-bold text-[#252525]">
              이메일 인증이 완료되었습니다.
            </h1>
            <p className="mt-3 text-center text-[15px] text-[#777]">
              이제 모든 서비스를 이용하실 수 있습니다.
            </p>
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="mt-9 h-[60px] w-full rounded-[3px] bg-[#121212] text-[18px] font-medium text-white"
            >
              로그인 하기
            </button>
          </>
        ) : null}

        {phase.kind === "done" ? (
          <>
            <CharacterPlaceholder />
            <h1 className="mt-6 text-center text-[22px] font-bold text-[#252525]">
              비밀번호 변경이 완료되었습니다.
            </h1>
            <p className="mt-3 text-center text-[15px] text-[#777]">
              새로운 비밀번호로 로그인해 주세요.
            </p>
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="mt-9 h-[60px] w-full rounded-[3px] bg-[#121212] text-[18px] font-medium text-white"
            >
              로그인 하기
            </button>
          </>
        ) : null}

        {phase.kind === "reset-form" || phase.kind === "reset-submitting" ? (
          <>
            <h1 className="text-[20px] font-bold text-[#252525]">
              회원님의 아이디 정보입니다.
            </h1>
            <div className="mt-4 flex items-center gap-8 rounded-[6px] bg-[#f7f7f7] px-6 py-5">
              <span className="text-[15px] text-[#777]">아이디</span>
              <span className="text-[17px] font-bold text-[#252525]">
                {phase.loginId ?? "설정된 아이디가 없습니다 (소셜 로그인 계정)"}
              </span>
            </div>

            <hr className="mt-7 border-t border-[#e3e3e3]" />

            <h2 className="mt-7 text-[19px] font-bold text-[#252525]">비밀번호 재설정</h2>

            <form className="mt-5" onSubmit={handleResetSubmit} noValidate>
              <label className="text-[15px] font-medium text-[#252525]">신규 비밀번호</label>
              <input
                type="password"
                autoComplete="new-password"
                placeholder="비밀번호 (영문 소문자·숫자·특수문자 8자 이상)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 h-[50px] w-full rounded-[3px] border border-[#d0d0d0] px-3 text-[15px] text-[#252525] placeholder:text-[#bdbdbd] focus:border-accent focus:outline-none"
              />
              <ul className="mt-2 flex flex-col gap-1">
                {pwRules.map((rule) => (
                  <li
                    key={rule.label}
                    className={`flex items-center gap-1.5 text-[13px] ${
                      rule.ok ? "text-[#22a36b]" : "text-[#9b9b9b]"
                    }`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                    {rule.label}
                  </li>
                ))}
              </ul>

              <label className="mt-5 block text-[15px] font-medium text-[#252525]">
                비밀번호 확인
              </label>
              <input
                type="password"
                autoComplete="new-password"
                placeholder="비밀번호를 확인해 주세요."
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                className="mt-2 h-[50px] w-full rounded-[3px] border border-[#d0d0d0] px-3 text-[15px] text-[#252525] placeholder:text-[#bdbdbd] focus:border-accent focus:outline-none"
              />
              {passwordConfirmError ? (
                <p className="mt-1 text-[13px] text-error">{passwordConfirmError}</p>
              ) : null}
              {submitError ? (
                <p className="mt-3 rounded-[3px] border border-error/30 bg-error/10 px-3 py-2 text-sm text-error" role="alert">
                  {submitError}
                </p>
              ) : null}

              <div className="mt-8 flex gap-3">
                <button
                  type="button"
                  onClick={() => router.push("/login")}
                  className="h-[56px] w-[40%] rounded-[3px] border border-[#d0d0d0] bg-white text-[17px] font-medium text-[#252525]"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit || phase.kind === "reset-submitting"}
                  className="h-[56px] flex-1 rounded-[3px] bg-[#121212] text-[17px] font-medium text-white disabled:cursor-not-allowed disabled:bg-[#f1f1f1] disabled:text-[#9b9b9b]"
                >
                  {phase.kind === "reset-submitting" ? "변경 중…" : "비밀번호 변경"}
                </button>
              </div>
            </form>
          </>
        ) : null}
      </div>
    </div>
  );
}

// 완료/인증 성공 화면의 캐릭터 자리(추후 실제 마스코트 이미지로 교체).
function CharacterPlaceholder() {
  return (
    <div className="mx-auto flex h-[140px] w-[140px] items-center justify-center rounded-full bg-[#e8eefb] text-xs text-accent">
      캐릭터
    </div>
  );
}
