"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { getFirebaseClient } from "@/lib/firebase-client";
import {
  getFirebaseAuthSessionServerSnapshot,
  getFirebaseAuthSessionSnapshot,
  parseFirebaseAuthSessionSnapshot,
  subscribeFirebaseAuthSession,
} from "@/lib/firebase-auth-session";
import { sanitizeFromPath } from "@/lib/use-require-auth";
import { fetchUserProfile } from "@/lib/user-profile-client";
import { SignupAuthStep } from "@/components/signup-auth-step";
import { SignupTermsStep } from "@/components/signup-terms-step";
import { SignupInfoForm } from "@/components/signup-info-form";

// 회원가입 4단계 위저드: 본인 인증 → 약관 동의 → 정보 입력 → 가입 완료.
// 이메일 가입: auth(이메일 선택) → terms → info(계정 생성) → done.
// 소셜 가입: auth(소셜) → OAuth → (복귀) → terms → info(완성) → done.
//   소셜 redirect 복귀나 미완성 프로필 상태로 재진입하면 resolving 단계에서 감지해
//   terms부터 이어서 진행한다. 이미 아이디까지 설정된 회원은 마이페이지로 보낸다.

type Step = "resolving" | "auth" | "terms" | "info" | "done";
type Method = "email" | "social";

export function SignupView() {
  const t = useTranslations("Auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromPath = sanitizeFromPath(searchParams.get("from")) ?? "/mypage";

  const snapshot = useSyncExternalStore(
    subscribeFirebaseAuthSession,
    getFirebaseAuthSessionSnapshot,
    getFirebaseAuthSessionServerSnapshot,
  );
  const session = parseFirebaseAuthSessionSnapshot(snapshot);

  const [step, setStep] = useState<Step>("resolving");
  const [method, setMethod] = useState<Method>("email");
  const [socialEmail, setSocialEmail] = useState("");
  const [emailVerificationSent, setEmailVerificationSent] = useState(false);
  // 초기 1회 해석(소셜 복귀/기존 회원 감지). 수동 흐름 진입 후에는 세션 변화로 재해석하지 않는다.
  // startedRef로 async를 정확히 한 번만 시작한다. cleanup으로 결과를 폐기하지 않는 이유:
  // session은 매 렌더 새 객체라 effect가 자주 재실행되고 StrictMode는 마운트를 두 번 돈다.
  // cleanup에서 cancelled로 결과를 막으면, 재실행은 startedRef에 막혀 새 async를 못 띄워
  // setStep이 영영 호출되지 않는다(무한 resolving). 따라서 시작만 한 번 가드하고 결과는 항상 반영한다.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    // 로그인 상태 확인 중이면 대기(아직 시작 가드를 세우지 않는다).
    if (!session.ok && session.reason === "not-ready") return;

    startedRef.current = true;

    if (!session.ok) {
      // 비로그인 → 가입 방식 선택부터.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStep("auth");
      return;
    }

    // 로그인 상태(소셜 복귀 등) → 프로필 완성 여부로 분기.
    void (async () => {
      let result: Awaited<ReturnType<typeof fetchUserProfile>> | null = null;
      try {
        result = await fetchUserProfile();
      } catch {
        result = null;
      }
      if (result && result.ok && result.profile && result.profile.loginId) {
        // 이미 아이디까지 설정된 회원 → 가입 절차 불필요.
        router.replace(fromPath);
        return;
      }
      // 미완성(소셜 직후 등)·조회 실패 → 소셜 완성 흐름으로 약관부터 이어서 진행.
      try {
        const { auth } = getFirebaseClient();
        setSocialEmail(auth.currentUser?.email ?? "");
      } catch {
        setSocialEmail("");
      }
      setMethod("social");
      setStep("terms");
    })();
  }, [session, fromPath, router]);

  function handleSelectEmail() {
    startedRef.current = true;
    setMethod("email");
    setStep("terms");
  }

  function handleSocialAuthenticated() {
    startedRef.current = true;
    try {
      const { auth } = getFirebaseClient();
      setSocialEmail(auth.currentUser?.email ?? "");
    } catch {
      setSocialEmail("");
    }
    setMethod("social");
    setStep("terms");
  }

  // 단계별 본문. 공통 헤더(로고 + 통합 회원가입 + 닫기)를 가진 풀스크린 셸 안에 렌더된다.
  let content: React.ReactNode;
  if (step === "resolving") {
    content = (
      <section
        className="w-full rounded-lg border border-line bg-white p-6 text-center shadow-sm"
        aria-busy="true"
      >
        <p className="text-sm text-slate-600">{t("resolving")}</p>
        <div className="mt-6 flex justify-center" aria-hidden="true">
          <span className="size-8 animate-spin rounded-full border-2 border-line border-t-accent" />
        </div>
      </section>
    );
  } else if (step === "auth") {
    content = (
      <SignupAuthStep
        onSelectEmail={handleSelectEmail}
        onSocialAuthenticated={handleSocialAuthenticated}
      />
    );
  } else if (step === "terms") {
    content = <SignupTermsStep onAgree={() => setStep("info")} />;
  } else if (step === "info") {
    content = (
      <SignupInfoForm
        mode={method}
        prefilledEmail={method === "social" ? socialEmail : undefined}
        onBack={() => setStep("terms")}
        onComplete={({ emailVerificationSent: sent }) => {
          setEmailVerificationSent(sent);
          setStep("done");
        }}
      />
    );
  } else {
    // done
    content = (
      <section
        className="w-full rounded-lg border border-success/30 bg-success/10 p-6 text-center shadow-sm"
        role="status"
      >
        <p className="text-sm font-semibold text-success">{t("doneTitle")}</p>
        <h1 className="mt-2 text-xl font-bold text-slate-950">{t("doneHeading")}</h1>
        {method === "email" && emailVerificationSent ? (
          <p className="mt-3 text-sm leading-6 text-slate-600">{t("doneVerify")}</p>
        ) : (
          <p className="mt-3 text-sm leading-6 text-slate-600">{t("doneBody")}</p>
        )}
        <Link
          href={fromPath}
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover"
        >
          {t("doneContinue")}
        </Link>
      </section>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-white">
      {/* 상단 헤더: 구분선은 풀폭, 내용(로고+타이틀+닫기)은 본문과 같은 컬럼 폭에 정렬 */}
      <header className="w-full border-b border-[#c9c9c9]">
        <div className="relative mx-auto flex h-[61px] w-full max-w-[520px] items-center justify-center px-5">
          <div className="flex items-center gap-1.5">
            <span className="text-[20px] font-extrabold leading-none tracking-[-0.02em] text-accent">
              서울체육예약
            </span>
            <span className="text-[22px] font-bold leading-none text-[#252525]">
              통합 회원가입
            </span>
          </div>
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="닫기"
            className="absolute right-5 flex items-center justify-center text-[#252525]"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 5l14 14M19 5L5 19" />
            </svg>
          </button>
        </div>
      </header>

      {/* 본문: 가운데 컬럼 */}
      <div className="mx-auto w-full max-w-[520px] px-5 pb-10 pt-10">{content}</div>
    </div>
  );
}
