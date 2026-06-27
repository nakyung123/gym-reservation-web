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
  const resolvedRef = useRef(false);

  useEffect(() => {
    if (resolvedRef.current) return;
    // 로그인 상태 확인 중이면 대기.
    if (!session.ok && session.reason === "not-ready") return;

    if (!session.ok) {
      // 비로그인 → 가입 방식 선택부터.
      resolvedRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStep("auth");
      return;
    }

    // 로그인 상태(소셜 복귀 등) → 프로필 완성 여부로 분기.
    resolvedRef.current = true;
    let cancelled = false;
    void (async () => {
      const result = await fetchUserProfile();
      if (cancelled) return;
      if (result.ok && result.profile && result.profile.loginId) {
        // 이미 아이디까지 설정된 회원 → 가입 절차 불필요.
        router.replace(fromPath);
        return;
      }
      // 미완성(소셜 직후 등) → 소셜 완성 흐름으로 약관부터 이어서 진행.
      try {
        const { auth } = getFirebaseClient();
        setSocialEmail(auth.currentUser?.email ?? "");
      } catch {
        setSocialEmail("");
      }
      setMethod("social");
      setStep("terms");
    })();
    return () => {
      cancelled = true;
    };
  }, [session, fromPath, router]);

  function handleSelectEmail() {
    resolvedRef.current = true;
    setMethod("email");
    setStep("terms");
  }

  function handleSocialAuthenticated() {
    resolvedRef.current = true;
    try {
      const { auth } = getFirebaseClient();
      setSocialEmail(auth.currentUser?.email ?? "");
    } catch {
      setSocialEmail("");
    }
    setMethod("social");
    setStep("terms");
  }

  if (step === "resolving") {
    return (
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
  }

  if (step === "auth") {
    return (
      <SignupAuthStep
        onSelectEmail={handleSelectEmail}
        onSocialAuthenticated={handleSocialAuthenticated}
      />
    );
  }

  if (step === "terms") {
    return <SignupTermsStep onAgree={() => setStep("info")} />;
  }

  if (step === "info") {
    return (
      <SignupInfoForm
        mode={method}
        prefilledEmail={method === "social" ? socialEmail : undefined}
        onComplete={({ emailVerificationSent: sent }) => {
          setEmailVerificationSent(sent);
          setStep("done");
        }}
      />
    );
  }

  // done
  return (
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
