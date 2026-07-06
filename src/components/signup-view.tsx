"use client";

import Image from "next/image";
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
import { SignupEmailStep } from "@/components/signup-email-step";
import { SignupTermsStep } from "@/components/signup-terms-step";
import { SignupInfoForm } from "@/components/signup-info-form";
import { SignupStepIndicator } from "@/components/signup-step-indicator";
import { AlertModal } from "@/components/alert-modal";

// 회원가입 4단계 위저드: 본인 인증 → 약관 동의 → 정보 입력 → 가입 완료.
// 이메일 가입: auth(이메일 선택) → terms → info(계정 생성) → done.
// 소셜 가입: auth(소셜) → OAuth → (복귀) → terms → info(완성) → done.
//   소셜 redirect 복귀나 미완성 프로필 상태로 재진입하면 resolving 단계에서 감지해
//   terms부터 이어서 진행한다. 이미 아이디까지 설정된 회원은 마이페이지로 보낸다.

type Step = "resolving" | "auth" | "email" | "terms" | "info" | "done";
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
  // 이메일 가입에서 '본인 인증' 단계에 입력한 이메일. 이후 단계로 넘겨 정보 입력에서 잠근다.
  const [emailAccountEmail, setEmailAccountEmail] = useState("");
  // 가입 완료 화면 인사말에 쓸 이름/아이디(정보 입력 완료 시 전달받는다).
  const [completedName, setCompletedName] = useState("");
  const [completedLoginId, setCompletedLoginId] = useState("");
  // 헤더 X: 진행 중 단계(auth/terms/info)에서는 이탈 확인 알림창을 띄운다.
  const [showExitConfirm, setShowExitConfirm] = useState(false);
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

  // 진행 중이면 이탈 확인, 완료/해석 단계에서는 바로 닫는다.
  function handleClose() {
    if (
      step === "auth" ||
      step === "email" ||
      step === "terms" ||
      step === "info"
    ) {
      setShowExitConfirm(true);
      return;
    }
    router.back();
  }

  // 이메일 간편가입: 먼저 이메일 입력(본인 인증) 단계로 이동한다.
  function handleSelectEmail() {
    startedRef.current = true;
    setMethod("email");
    setStep("email");
  }

  // 이메일 입력 완료 → 이메일을 보관하고 약관 단계로.
  function handleEmailEntered(email: string) {
    setEmailAccountEmail(email);
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
  } else if (step === "email") {
    content = (
      <SignupEmailStep
        initialEmail={emailAccountEmail}
        onNext={handleEmailEntered}
      />
    );
  } else if (step === "terms") {
    content = <SignupTermsStep onAgree={() => setStep("info")} />;
  } else if (step === "info") {
    content = (
      <SignupInfoForm
        mode={method}
        prefilledEmail={method === "social" ? socialEmail : emailAccountEmail}
        onBack={() => setStep("terms")}
        onComplete={({ name, loginId }) => {
          setCompletedName(name);
          setCompletedLoginId(loginId);
          setStep("done");
        }}
      />
    );
  } else {
    // done — 진행 인디케이터 + 구분선 + 환영 인사 + 캐릭터 + 로그인하기.
    const greetingName = completedName.trim() || completedLoginId;
    content = (
      <section className="w-full" role="status">
        <SignupStepIndicator current={3} />
        <hr className="mt-8 border-t border-[#e3e3e3]" />

        <div className="mt-10 text-center">
          <h1 className="text-[23px] font-bold leading-[1.35] text-[#252525]">
            {greetingName}
            {completedLoginId ? `(${completedLoginId})` : ""}님 환영합니다.
          </h1>
          <p className="mt-3 text-[18px] leading-[1.6] text-[#252525]">
            지금부터 서울체육예약 아이디로
            <br />
            서비스를 이용하실 수 있습니다.
          </p>

          {/* 캐릭터 이미지 250 x 250 */}
          <div className="mx-auto mt-10 flex h-[250px] w-[250px] items-center justify-center">
            <Image
              src="/signup-character.png"
              alt="서울체육예약 캐릭터"
              width={250}
              height={250}
              className="h-[250px] w-[250px] object-contain"
            />
          </div>

          {/* 캐릭터-버튼 간격은 기존의 2배(mt-16). */}
          <div className="mt-16 flex justify-center">
            <Link
              href="/login"
              className="flex h-[60px] w-full max-w-[480px] items-center justify-center rounded-[3px] bg-[#121212] text-[18px] font-medium text-white transition hover:opacity-90"
            >
              로그인하기
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-white">
      {/* 상단 헤더: 구분선은 풀폭, 내용(로고+타이틀+닫기)은 본문과 같은 컬럼 폭에 정렬 */}
      <header className="w-full border-b border-[#c9c9c9]">
        <div className="relative mx-auto flex h-[61px] w-full max-w-[520px] items-center justify-center px-5">
          <span className="text-[22px] font-bold leading-none text-[#252525]">
            서울체육예약 회원가입
          </span>
          <button
            type="button"
            onClick={handleClose}
            aria-label="닫기"
            className="absolute right-5 flex items-center justify-center text-[#252525]"
          >
            <svg
              width="26"
              height="26"
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

      {/* 이탈 확인 알림창 — 확인 시 홈으로 이동 */}
      {showExitConfirm ? (
        <AlertModal
          message="회원가입을 멈추고 홈으로 돌아가시겠습니까?"
          onClose={() => setShowExitConfirm(false)}
          confirm={{
            confirmLabel: "홈으로",
            onConfirm: () => router.push("/"),
          }}
        />
      ) : null}
    </div>
  );
}
