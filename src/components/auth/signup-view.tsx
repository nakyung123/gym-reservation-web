"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslations } from "next-intl";
import { deleteUser, signOut } from "firebase/auth";
import { getFirebaseClient } from "@/lib/firebase-client";
import {
  getFirebaseAuthSessionServerSnapshot,
  getFirebaseAuthSessionSnapshot,
  parseFirebaseAuthSessionSnapshot,
  subscribeFirebaseAuthSession,
} from "@/lib/firebase-auth-session";
import {
  completeSignupEmailLink,
  getStoredSignupEmail,
  isSignupEmailLink,
} from "@/lib/firebase-email-auth";
import { sanitizeFromPath } from "@/lib/use-require-auth";
import { fetchUserProfile } from "@/lib/user-profile-client";
import { SignupAuthStep } from "@/components/auth/signup-auth-step";
import { SignupEmailStep } from "@/components/auth/signup-email-step";
import { SignupTermsStep } from "@/components/auth/signup-terms-step";
import { SignupInfoForm } from "@/components/auth/signup-info-form";
import { SignupStepIndicator } from "@/components/auth/signup-step-indicator";
import { AlertModal } from "@/components/ui/alert-modal";

// 회원가입 4단계 위저드: 본인 인증 → 약관 동의 → 정보 입력 → 가입 완료.
// 이메일 가입(가입 전 인증): auth(이메일 선택) → email(인증 링크 발송·대기) →
//   (메일의 링크 클릭으로 복귀, 이메일 소유 확정·비밀번호 없는 로그인) → terms →
//   info(비밀번호·아이디 설정) → done. 링크를 클릭하기 전에는 다음 단계로 넘어갈 수 없다.
// 소셜 가입: auth(소셜) → OAuth → (복귀) → terms → info(완성) → done.
//   소셜 redirect 복귀나 미완성 프로필 상태로 재진입하면 resolving 단계에서 감지해
//   terms부터 이어서 진행한다. 이미 아이디까지 설정된 회원은 마이페이지로 보낸다.
// link-email: 인증 링크를 다른 기기(또는 저장 유실 브라우저)에서 열었을 때
//   본인 확인을 위해 링크를 받은 이메일을 재입력하는 단계.

type Step =
  | "resolving"
  | "auth"
  | "email"
  | "link-email"
  | "terms"
  | "info"
  | "done";
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
  // 이미 가입된 소셜 계정으로 재가입을 시도했을 때의 안내(확인 시 로그인 화면으로).
  const [existingAccountAlert, setExistingAccountAlert] = useState(false);
  // 이메일 인증 링크 복귀 처리 상태. linkHrefRef는 검증에 쓸 원본 링크 URL,
  // linkAlert는 만료/불일치 등 명시적 실패 안내(next: 닫은 뒤 이동할 단계).
  const linkHrefRef = useRef<string | null>(null);
  const [linkAlert, setLinkAlert] = useState<{
    message: string;
    next: "email" | "none";
  } | null>(null);
  const [linkEmailInput, setLinkEmailInput] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  // 초기 1회 해석(소셜 복귀/기존 회원 감지). 수동 흐름 진입 후에는 세션 변화로 재해석하지 않는다.
  // startedRef로 async를 정확히 한 번만 시작한다. cleanup으로 결과를 폐기하지 않는 이유:
  // session은 매 렌더 새 객체라 effect가 자주 재실행되고 StrictMode는 마운트를 두 번 돈다.
  // cleanup에서 cancelled로 결과를 막으면, 재실행은 startedRef에 막혀 새 async를 못 띄워
  // setStep이 영영 호출되지 않는다(무한 resolving). 따라서 시작만 한 번 가드하고 결과는 항상 반영한다.
  const startedRef = useRef(false);

  // 링크 인증 직후(또는 인증된 세션으로 재진입) 위저드를 이어간다.
  // 이미 아이디까지 설정된 기존 회원이면 가입 절차가 필요 없어 원래 목적지로 보낸다.
  const resumeAfterEmailLink = useCallback(async () => {
    let result: Awaited<ReturnType<typeof fetchUserProfile>> | null = null;
    try {
      result = await fetchUserProfile();
    } catch {
      result = null;
    }
    if (result && result.ok && result.profile && result.profile.loginId) {
      router.replace(fromPath);
      return;
    }
    let verifiedEmail = "";
    try {
      const { auth } = getFirebaseClient();
      verifiedEmail = auth.currentUser?.email ?? "";
    } catch {
      verifiedEmail = "";
    }
    setMethod("email");
    setEmailAccountEmail(verifiedEmail);
    setStep("terms");
  }, [router, fromPath]);

  // 링크 검증 실행. 실패는 종류별로 명시적으로 안내한다(말없는 fallback 금지).
  const completeEmailLink = useCallback(
    async (email: string, href: string) => {
      setLinkBusy(true);
      const result = await completeSignupEmailLink(email, href);
      if (!result.ok) {
        setLinkBusy(false);
        if (result.reason === "email-mismatch") {
          // 재입력한 이메일이 링크를 받은 주소와 다름 → 재입력 단계에서 다시 시도.
          setStep("link-email");
          setLinkAlert({ message: result.message, next: "none" });
          return;
        }
        // 이미 사용된 링크를 다시 열었더라도 이 브라우저에 로그인 세션이 남아 있으면
        // 실패로 보지 않고 진행 중이던 가입을 이어간다(재클릭 멱등).
        let hasSession = false;
        try {
          hasSession = Boolean(getFirebaseClient().auth.currentUser);
        } catch {
          hasSession = false;
        }
        if (hasSession) {
          router.replace("/signup");
          await resumeAfterEmailLink();
          return;
        }
        // 만료/무효 링크 → 안내 후 이메일 단계에서 재발송하게 한다.
        setLinkAlert({ message: result.message, next: "email" });
        return;
      }
      // 검증 성공: URL의 oobCode를 제거하고 약관 단계로 이어간다.
      router.replace("/signup");
      setLinkBusy(false);
      await resumeAfterEmailLink();
    },
    [router, resumeAfterEmailLink],
  );

  // 이메일 인증 링크 복귀 진입점. 같은 브라우저면 보관된 이메일로 즉시 검증하고,
  // 다른 기기(또는 저장 유실)면 이메일 재입력 단계로 보낸다.
  const resolveEmailLink = useCallback(
    async (href: string) => {
      linkHrefRef.current = href;
      const stored = getStoredSignupEmail();
      if (!stored) {
        setStep("link-email");
        return;
      }
      await completeEmailLink(stored, href);
    },
    [completeEmailLink],
  );

  useEffect(() => {
    if (startedRef.current) return;

    // 이메일 인증 링크로 복귀한 경우: 세션 준비를 기다리지 않고 링크부터 처리한다.
    if (isSignupEmailLink(window.location.href)) {
      startedRef.current = true;
      // startedRef 가드로 1회만 실행된다(파일 상단 resolving 주석 참고).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void resolveEmailLink(window.location.href);
      return;
    }

    // 로그인 상태 확인 중이면 대기(아직 시작 가드를 세우지 않는다).
    if (!session.ok && session.reason === "not-ready") return;

    startedRef.current = true;

    if (!session.ok) {
      // 비로그인 → 가입 방식 선택부터.
      setStep("auth");
      return;
    }

    // 로그인 상태(소셜 복귀·링크 인증 후 재진입 등) → 프로필 완성 여부로 분기.
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
      // 미완성·조회 실패 → 가입 방식에 맞춰 약관부터 이어서 진행한다.
      let user: ReturnType<typeof getFirebaseClient>["auth"]["currentUser"] = null;
      try {
        const { auth } = getFirebaseClient();
        user = auth.currentUser;
      } catch {
        user = null;
      }
      // 소셜 provider(google.com, oidc.kakao 등)가 하나라도 있으면 소셜 완성 흐름,
      // 이메일 링크로만 만들어진 계정이면 이메일 흐름으로 복원한다(비밀번호 재설정 필요).
      const isSocialUser =
        user?.providerData.some(
          (p) => p.providerId !== "password" && p.providerId !== "emailLink",
        ) ?? true;
      if (isSocialUser || !user?.email) {
        setSocialEmail(user?.email ?? "");
        setMethod("social");
      } else {
        setEmailAccountEmail(user.email);
        setMethod("email");
      }
      setStep("terms");
    })();
  }, [session, fromPath, router, resolveEmailLink]);

  // 진행 중이면 이탈 확인, 완료/해석 단계에서는 바로 닫는다.
  function handleClose() {
    if (
      step === "auth" ||
      step === "email" ||
      step === "link-email" ||
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

  // 대기 화면에서 링크 클릭이 감지되면(다른 탭에서 인증 → 세션 로그인) 약관 단계로 진행.
  function handleEmailVerified() {
    void resumeAfterEmailLink();
  }

  // 다른 기기/저장 유실 복귀: 재입력한 이메일로 링크를 검증한다.
  async function handleLinkEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (linkBusy) return;
    const trimmed = linkEmailInput.trim();
    if (trimmed.length === 0) {
      setLinkAlert({ message: "이메일을 입력해 주세요.", next: "none" });
      return;
    }
    const href = linkHrefRef.current;
    if (!href) {
      setLinkAlert({
        message: "유효하지 않은 접근입니다. 메일의 링크로 다시 시도해 주세요.",
        next: "email",
      });
      return;
    }
    await completeEmailLink(trimmed, href);
  }

  // 링크 오류 알림 닫기: 만료/무효면 이메일 단계로 보내 재발송하게 한다.
  function handleLinkAlertClose() {
    const next = linkAlert?.next;
    setLinkAlert(null);
    if (next === "email") {
      setMethod("email");
      setStep("email");
    }
  }

  async function handleSocialAuthenticated() {
    startedRef.current = true;
    // 이미 아이디까지 설정된 계정이면 '재가입'이 아니라 기존 회원이다.
    // 소셜 로그인으로 방금 세션이 생겼더라도, 가입을 유지하지 않고 로그아웃 후
    // 로그인 화면으로 안내한다(일반적인 사이트 동작: 재가입 대신 로그인).
    let profile: Awaited<ReturnType<typeof fetchUserProfile>> | null = null;
    try {
      profile = await fetchUserProfile();
    } catch {
      profile = null;
    }
    if (profile && profile.ok && profile.profile && profile.profile.loginId) {
      try {
        const { auth } = getFirebaseClient();
        await signOut(auth);
      } catch {
        // 세션 정리 실패는 무시(로그인 화면에서 다시 로그인하면 세션이 교체된다).
      }
      setExistingAccountAlert(true);
      return;
    }
    try {
      const { auth } = getFirebaseClient();
      setSocialEmail(auth.currentUser?.email ?? "");
    } catch {
      setSocialEmail("");
    }
    setMethod("social");
    setStep("terms");
  }

  // 이탈 확인('홈으로'): 미완성 가입(loginId 없음) 상태면 이메일 인증만으로 생성된
  // 고아 Firebase 계정을 삭제해 정보/약관 미완료 계정이 남지 않게 한다.
  // 삭제가 불가하면(재인증 필요 등) 최소한 로그아웃해 세션을 남기지 않는다.
  async function handleExitConfirm() {
    setShowExitConfirm(false);
    try {
      const { auth } = getFirebaseClient();
      const user = auth.currentUser;
      if (user) {
        let complete = false;
        try {
          const profile = await fetchUserProfile();
          complete = Boolean(profile.ok && profile.profile?.loginId);
        } catch {
          complete = false;
        }
        if (!complete) {
          try {
            await deleteUser(user);
          } catch {
            try {
              await signOut(auth);
            } catch {
              // 세션 정리 실패도 무시하고 홈으로 이동한다.
            }
          }
        }
      }
    } catch {
      // Firebase 클라이언트 획득 실패 등은 무시하고 홈으로 이동한다.
    }
    router.push("/");
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
        sessionReady={session.ok}
        onVerified={handleEmailVerified}
      />
    );
  } else if (step === "link-email") {
    // 인증 링크를 다른 기기에서 열었거나 보관된 이메일이 없을 때의 본인 확인 화면.
    content = (
      <section className="w-full">
        <h1 className="mt-6 text-center text-[23px] font-bold leading-[1.4] text-[#252525]">
          인증 메일을 받은 이메일을
          <br />
          입력해 주세요.
        </h1>
        <p className="mt-4 text-center text-[18px] leading-[1.6] text-[#252525]">
          보안을 위해 인증 링크를 요청한
          <br />
          이메일 주소를 확인합니다.
        </p>

        <form className="mt-8" onSubmit={handleLinkEmailSubmit} noValidate>
          <input
            type="email"
            autoComplete="email"
            placeholder="이메일을 입력해 주세요."
            value={linkEmailInput}
            onChange={(e) => setLinkEmailInput(e.target.value)}
            className="h-[50px] w-full rounded-[3px] border border-[#d0d0d0] px-3 text-[15px] text-[#252525] placeholder:text-[#bdbdbd] focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={linkBusy}
            className="mt-6 h-[56px] w-full rounded-[3px] bg-[#121212] text-[17px] font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-90"
          >
            {linkBusy ? "확인 중…" : "인증 완료하기"}
          </button>
        </form>
      </section>
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
          {/* 가입 직후 세션을 정리하고 로그인 화면에서 새 아이디로 직접 로그인하게 한다.
              signOut 실패 시에도 로그인 화면으로는 이동한다(재로그인 시 세션 교체됨). */}
          <div className="mt-16 flex justify-center">
            <button
              type="button"
              onClick={async () => {
                try {
                  const { auth } = getFirebaseClient();
                  await signOut(auth);
                } catch {
                  // 세션 정리 실패는 무시하고 로그인 화면으로 이동한다.
                }
                router.replace("/login");
              }}
              className="flex h-[60px] w-full max-w-[480px] items-center justify-center rounded-[3px] bg-[#121212] text-[18px] font-medium text-white transition hover:opacity-90"
            >
              로그인하기
            </button>
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

      {/* 링크 검증 실패(만료/불일치 등) 알림창 */}
      {linkAlert ? (
        <AlertModal message={linkAlert.message} onClose={handleLinkAlertClose} />
      ) : null}

      {/* 이탈 확인 알림창 — 확인 시 미완성 계정 정리 후 홈으로 이동 */}
      {showExitConfirm ? (
        <AlertModal
          message="회원가입을 멈추고 홈으로 돌아가시겠습니까?"
          onClose={() => setShowExitConfirm(false)}
          confirm={{
            confirmLabel: "홈으로",
            onConfirm: () => void handleExitConfirm(),
          }}
        />
      ) : null}

      {/* 이미 가입된 소셜 계정 안내 — 확인 시 로그인 화면으로 */}
      {existingAccountAlert ? (
        <AlertModal
          message="이미 가입된 계정입니다. 로그인 화면으로 이동합니다."
          onClose={() => {
            setExistingAccountAlert(false);
            router.replace("/login");
          }}
        />
      ) : null}
    </div>
  );
}
