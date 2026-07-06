"use client";

import { useRef, useState } from "react";
import { EmailAuthProvider, linkWithCredential } from "firebase/auth";
import { signupWithEmail } from "@/lib/firebase-email-auth";
import { getFirebaseClient } from "@/lib/firebase-client";
import { checkLoginIdAvailability, setLoginId } from "@/lib/login-id-client";
import { checkEmailAvailability } from "@/lib/email-availability-client";
import { ensureUserProfile, saveUserProfile } from "@/lib/user-profile-client";
import { validatePasswordPolicy } from "@/lib/password-policy";
import {
  LOGIN_ID_HINT,
  parseBirthDate,
  validateLoginId,
  validateUserProfileInput,
} from "@/lib/user-profile";
import { formatBirthDate } from "@/lib/input-format";
import { SignupStepIndicator } from "@/components/signup-step-indicator";
import { AlertModal } from "@/components/alert-modal";

// 회원가입 3단계: 정보 입력. email(직접가입)·social(소셜 후 완성) 두 모드를 공통 처리한다.
// 다단계 저장(계정 생성/비번 연결 → 프로필 보장 → 아이디 설정 → 프로필 저장)을 각 단계 ref로
// 가드해, 중간 실패 후 재시도해도 이미 끝난 단계를 다시 실행하지 않는다(부분 실패·멱등성).

type Mode = "email" | "social";

type IdCheck =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available" }
  | { status: "taken" }
  | { status: "invalid"; message: string }
  | { status: "error"; message: string };

type EmailCheck =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available" }
  | { status: "taken" }
  | { status: "invalid" }
  | { status: "error"; message: string };

type SubmitState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string };

const DOMAIN_PRESETS = [
  "직접입력",
  "naver.com",
  "gmail.com",
  "daum.net",
  "hanmail.net",
  "nate.com",
  "kakao.com",
];

const INPUT_CLASS =
  "h-[50px] w-full rounded-[3px] border border-[#d0d0d0] px-3 text-[15px] text-[#252525] placeholder:text-[#bdbdbd] focus:border-accent focus:outline-none disabled:bg-[#f3f3f3] disabled:text-[#888]";

export function SignupInfoForm({
  mode,
  prefilledEmail,
  onComplete,
  onBack,
}: {
  mode: Mode;
  prefilledEmail?: string;
  onComplete: (result: {
    emailVerificationSent: boolean;
    name: string;
    loginId: string;
  }) => void;
  onBack?: () => void;
}) {
  const initialEmail = prefilledEmail ?? "";
  const initialLocal = initialEmail.includes("@") ? initialEmail.split("@")[0] : "";
  const initialDomain = initialEmail.includes("@") ? initialEmail.split("@")[1] : "";

  const [loginId, setLoginIdValue] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phoneA, setPhoneA] = useState("010");
  const [phoneB, setPhoneB] = useState("");
  const [phoneC, setPhoneC] = useState("");
  const [emailLocal, setEmailLocal] = useState(initialLocal);
  const [emailDomain, setEmailDomain] = useState(initialDomain);
  const [domainPreset, setDomainPreset] = useState("직접입력");
  const [idCheck, setIdCheck] = useState<IdCheck>({ status: "idle" });
  const [emailCheck, setEmailCheck] = useState<EmailCheck>({ status: "idle" });
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });
  // 다음 버튼은 항상 활성화하고, 미완료 항목이 있으면 이 알림창으로 안내한다.
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  // 다단계 진행 가드. 재시도 시 완료된 단계를 건너뛴다.
  const accountReadyRef = useRef(false);
  const loginIdSetRef = useRef(false);
  const emailVerificationSentRef = useRef(false);

  // 소셜은 물론, 이메일 가입도 앞 단계(본인 인증)에서 이메일을 받았으면 정보 입력에서 잠근다(재입력 방지).
  const emailLocked = mode === "social" || Boolean(prefilledEmail);

  const combinedPhone =
    phoneA && phoneB && phoneC ? `${phoneA}-${phoneB}-${phoneC}` : "";
  const combinedEmail =
    emailLocal.trim() && emailDomain.trim()
      ? `${emailLocal.trim()}@${emailDomain.trim()}`
      : "";

  // 빈 값은 "아직 입력 안 함"으로 보고 인라인 에러를 띄우지 않는다.
  const loginIdValidation = validateLoginId(loginId);
  const loginIdError =
    loginId.length > 0 && !loginIdValidation.ok ? loginIdValidation.message : null;
  // 생년월일은 서버와 같은 규칙(parseBirthDate)으로 사전 검증한다. 빈 값은 아직 미입력으로 본다.
  const trimmedBirthDate = birthDate.trim();
  const birthDateCheck = parseBirthDate(trimmedBirthDate);
  const birthDateError =
    trimmedBirthDate.length > 0 && !birthDateCheck.ok ? birthDateCheck.message : null;
  const passwordError = validatePasswordPolicy(password);
  const passwordConfirmError =
    passwordConfirm.length > 0 && passwordConfirm !== password
      ? "비밀번호가 일치하지 않습니다."
      : null;

  const pwRules = [
    { label: "8자 이상", ok: password.length >= 8 },
    { label: "영문 소문자 포함", ok: /[a-z]/.test(password) },
    { label: "숫자 포함", ok: /[0-9]/.test(password) },
    { label: "특수문자 포함", ok: /[^A-Za-z0-9]/.test(password) },
  ];

  const isLoading = submitState.kind === "loading";
  const isFormValid =
    idCheck.status === "available" &&
    password.length > 0 &&
    passwordConfirm.length > 0 &&
    !passwordError &&
    !passwordConfirmError &&
    name.trim().length > 0 &&
    trimmedBirthDate.length > 0 &&
    birthDateCheck.ok &&
    combinedPhone.length > 0 &&
    combinedEmail.length > 0 &&
    (emailLocked || emailCheck.status === "available");

  function handleLoginIdChange(value: string) {
    setLoginIdValue(value);
    setIdCheck({ status: "idle" });
  }

  async function handleCheckId() {
    const validation = validateLoginId(loginId);
    if (!validation.ok) {
      setIdCheck({ status: "invalid", message: validation.message });
      return;
    }
    setIdCheck({ status: "checking" });
    const result = await checkLoginIdAvailability(validation.value);
    if (!result.ok) {
      setIdCheck({ status: "error", message: result.message });
      return;
    }
    if (result.available) {
      setIdCheck({ status: "available" });
      return;
    }
    setIdCheck(
      result.reason === "invalid"
        ? { status: "invalid", message: "사용할 수 없는 아이디입니다." }
        : { status: "taken" },
    );
  }

  // 이메일 입력이 바뀌면 직전 중복확인 결과를 무효화한다.
  function handleEmailLocalChange(value: string) {
    setEmailLocal(value);
    setEmailCheck({ status: "idle" });
  }

  function handleDomainPresetChange(value: string) {
    setDomainPreset(value);
    setEmailDomain(value === "직접입력" ? "" : value);
    setEmailCheck({ status: "idle" });
  }

  function handleEmailDomainChange(value: string) {
    setEmailDomain(value);
    setEmailCheck({ status: "idle" });
  }

  async function handleCheckEmail() {
    if (!combinedEmail) {
      setEmailCheck({ status: "invalid" });
      return;
    }
    setEmailCheck({ status: "checking" });
    const result = await checkEmailAvailability(combinedEmail);
    if (!result.ok) {
      setEmailCheck({ status: "error", message: result.message });
      return;
    }
    if (result.available) {
      setEmailCheck({ status: "available" });
      return;
    }
    setEmailCheck({ status: result.reason === "invalid" ? "invalid" : "taken" });
  }

  // 미완료 항목을 위에서부터 찾아 첫 안내 문구를 돌려준다(다음 버튼 클릭 시 알림창용).
  function firstInvalidMessage(): string | null {
    if (idCheck.status !== "available") return "아이디 중복 확인을 완료해 주세요.";
    if (password.length === 0 || passwordError)
      return "비밀번호를 조건에 맞게 입력해 주세요.";
    if (passwordConfirm.length === 0 || passwordConfirmError)
      return "비밀번호가 일치하는지 확인해 주세요.";
    if (name.trim().length === 0) return "성명을 입력해 주세요.";
    if (trimmedBirthDate.length === 0) return "생년월일을 입력해 주세요.";
    if (!birthDateCheck.ok) return birthDateCheck.message;
    if (combinedPhone.length === 0) return "연락처를 입력해 주세요.";
    if (combinedEmail.length === 0) return "이메일을 입력해 주세요.";
    if (!emailLocked && emailCheck.status !== "available")
      return "이메일 중복 확인을 완료해 주세요.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // 다음 버튼은 항상 활성화. 미완료 항목이 있으면 알림창으로 안내한다.
    if (!isFormValid) {
      setAlertMessage(firstInvalidMessage() ?? "입력 정보를 다시 확인해 주세요.");
      return;
    }
    setSubmitState({ kind: "loading" });

    // 1단계: 계정 준비 (email=계정 생성, social=비밀번호 연결).
    if (!accountReadyRef.current) {
      if (mode === "email") {
        const created = await signupWithEmail({ email: combinedEmail, password });
        if (!created.ok) {
          setSubmitState({ kind: "error", message: created.message });
          return;
        }
        accountReadyRef.current = true;
        emailVerificationSentRef.current = created.emailVerificationSent;
      } else {
        const linked = await linkSocialPassword(combinedEmail, password);
        if (!linked.ok) {
          setSubmitState({ kind: "error", message: linked.message });
          return;
        }
        accountReadyRef.current = true;
      }
    }

    // 2단계: 프로필 보장(없으면 생성).
    const ensured = await ensureUserProfile();
    if (!ensured.ok) {
      setSubmitState({ kind: "error", message: ensured.message });
      return;
    }

    // 3단계: 아이디 1회 설정.
    if (!loginIdSetRef.current) {
      const idResult = await setLoginId(loginId);
      if (!idResult.ok) {
        setIdCheck({ status: "taken" });
        setSubmitState({ kind: "error", message: idResult.message });
        return;
      }
      loginIdSetRef.current = true;
    }

    // 4단계: 회원정보 저장(성명·생년월일·연락처). 주소 입력칸은 제거됨(null 저장).
    const validation = validateUserProfileInput({
      name: name.trim(),
      phone: combinedPhone,
      birthDate: birthDate.trim(),
      address: null,
      reservationNotificationsEnabled: true,
    });
    if (!validation.ok) {
      setSubmitState({ kind: "error", message: validation.message });
      return;
    }
    const saved = await saveUserProfile(validation.input);
    if (!saved.ok) {
      setSubmitState({ kind: "error", message: saved.message });
      return;
    }

    onComplete({
      emailVerificationSent: emailVerificationSentRef.current,
      name: name.trim(),
      loginId,
    });
  }

  return (
    <div>
      <SignupStepIndicator current={2} />

      <div className="mt-8 flex items-end justify-between">
        <h1 className="text-[22px] font-bold text-[#252525]">
          필수 정보를 입력해 주세요.
        </h1>
        <span className="text-[14px] text-[#252525]">
          <span className="text-red-500">*</span>필수입력
        </span>
      </div>

      <form className="mt-6 flex flex-col gap-6" onSubmit={handleSubmit} noValidate>
        {/* 아이디 */}
        <Field label="아이디">
          <div className="flex gap-2">
            <input
              type="text"
              autoComplete="username"
              placeholder="아이디 (영문 소문자, 숫자 포함 4자 이상)"
              value={loginId}
              onChange={(e) => handleLoginIdChange(e.target.value)}
              className={`${INPUT_CLASS} flex-1`}
            />
            <button
              type="button"
              onClick={handleCheckId}
              disabled={isLoading || idCheck.status === "checking"}
              className="h-[50px] shrink-0 rounded-[3px] bg-[#121212] px-4 text-[14px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {idCheck.status === "checking" ? "확인 중" : "중복 확인"}
            </button>
          </div>
          {idCheck.status === "available" ? (
            <Hint tone="ok">사용할 수 있는 아이디입니다.</Hint>
          ) : idCheck.status === "taken" ? (
            <Hint tone="err">이미 사용 중인 아이디입니다.</Hint>
          ) : idCheck.status === "invalid" || idCheck.status === "error" ? (
            <Hint tone="err">{idCheck.message}</Hint>
          ) : loginIdError ? (
            <Hint tone="err">{loginIdError}</Hint>
          ) : (
            <Hint tone="muted">{LOGIN_ID_HINT}</Hint>
          )}
        </Field>

        {/* 비밀번호 */}
        <Field label="비밀번호">
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="비밀번호 (영문 소문자·숫자·특수문자 8자 이상)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${INPUT_CLASS} pr-12`}
            />
            <PasswordToggle
              shown={showPassword}
              onToggle={() => setShowPassword((v) => !v)}
            />
          </div>
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
        </Field>

        {/* 비밀번호 확인 */}
        <Field label="비밀번호 확인">
          <div className="relative">
            <input
              type={showPasswordConfirm ? "text" : "password"}
              autoComplete="new-password"
              placeholder="비밀번호를 확인해 주세요."
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              className={`${INPUT_CLASS} pr-12`}
            />
            <PasswordToggle
              shown={showPasswordConfirm}
              onToggle={() => setShowPasswordConfirm((v) => !v)}
            />
          </div>
          {passwordConfirmError ? <Hint tone="err">{passwordConfirmError}</Hint> : null}
        </Field>

        {/* 성명 */}
        <Field label="성명">
          <input
            type="text"
            autoComplete="name"
            placeholder="성명을 입력해 주세요."
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={INPUT_CLASS}
          />
        </Field>

        {/* 생년월일 — 숫자 입력 시 자동으로 - 삽입(YYYY-MM-DD), 8자리 제한 */}
        <Field label="생년월일">
          <input
            type="text"
            inputMode="numeric"
            placeholder="YYYY-MM-DD"
            value={birthDate}
            onChange={(e) => setBirthDate(formatBirthDate(e.target.value))}
            maxLength={10}
            className={INPUT_CLASS}
          />
          {birthDateError ? <Hint tone="err">{birthDateError}</Hint> : null}
        </Field>

        {/* 연락처 */}
        <Field label="연락처">
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={phoneA}
              onChange={(e) => setPhoneA(e.target.value)}
              className={`${INPUT_CLASS} flex-1 text-center`}
            />
            <span className="text-[#9b9b9b]">-</span>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={phoneB}
              onChange={(e) => setPhoneB(e.target.value)}
              className={`${INPUT_CLASS} flex-1 text-center`}
            />
            <span className="text-[#9b9b9b]">-</span>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={phoneC}
              onChange={(e) => setPhoneC(e.target.value)}
              className={`${INPUT_CLASS} flex-1 text-center`}
            />
          </div>
        </Field>

        {/* 이메일 */}
        <Field label="이메일">
          <div className="flex items-center gap-2">
            <input
              type="text"
              autoComplete="email"
              value={emailLocal}
              onChange={(e) => handleEmailLocalChange(e.target.value)}
              disabled={emailLocked}
              className={`${INPUT_CLASS} flex-1`}
            />
            <span className="text-[#252525]">@</span>
            <input
              type="text"
              value={emailDomain}
              onChange={(e) => handleEmailDomainChange(e.target.value)}
              disabled={emailLocked || domainPreset !== "직접입력"}
              className={`${INPUT_CLASS} flex-1`}
            />
          </div>
          <div className="mt-2 flex gap-2">
            {/* 도메인 선택: 네이티브 화살표 대신 앱 공통 톤의 커스텀 셰브론 사용(일관성) */}
            <div className="relative flex-1">
              <select
                value={domainPreset}
                onChange={(e) => handleDomainPresetChange(e.target.value)}
                disabled={emailLocked}
                className={`${INPUT_CLASS} w-full appearance-none pr-10`}
              >
                {DOMAIN_PRESETS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#252525]"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
            {!emailLocked ? (
              <button
                type="button"
                onClick={handleCheckEmail}
                disabled={isLoading || emailCheck.status === "checking"}
                className="h-[50px] shrink-0 rounded-[3px] bg-[#121212] px-4 text-[14px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {emailCheck.status === "checking" ? "확인 중" : "중복 확인"}
              </button>
            ) : null}
          </div>
          {emailLocked ? (
            <Hint tone="muted">
              {mode === "social"
                ? "소셜 계정에서 가져온 이메일입니다."
                : "앞에서 입력한 이메일입니다."}
            </Hint>
          ) : emailCheck.status === "available" ? (
            <Hint tone="ok">사용할 수 있는 이메일입니다.</Hint>
          ) : emailCheck.status === "taken" ? (
            <Hint tone="err">이미 사용 중인 이메일입니다.</Hint>
          ) : emailCheck.status === "invalid" ? (
            <Hint tone="err">이메일 형식이 올바르지 않습니다.</Hint>
          ) : emailCheck.status === "error" ? (
            <Hint tone="err">{emailCheck.message}</Hint>
          ) : null}
        </Field>

        {submitState.kind === "error" ? (
          <p
            className="rounded-[3px] border border-error/30 bg-error/10 px-3 py-2 text-sm text-error"
            role="alert"
          >
            {submitState.message}
          </p>
        ) : null}

        {/* 이전 / 다음 — 두 버튼 동일 크기(flex-1), 간격 gap-3 유지.
            다음 버튼은 항상 활성화하고 미완료 항목은 알림창으로 안내한다. */}
        <div className="mt-2 flex gap-3">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              disabled={isLoading}
              className="h-[56px] flex-1 rounded-[3px] border border-[#d0d0d0] bg-white text-[17px] font-medium text-[#252525] disabled:cursor-not-allowed disabled:opacity-60"
            >
              이전
            </button>
          ) : null}
          <button
            type="submit"
            disabled={isLoading}
            className="h-[56px] flex-1 rounded-[3px] bg-[#121212] text-[17px] font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-90"
          >
            {isLoading ? "처리 중…" : "다음"}
          </button>
        </div>
      </form>

      {/* 통일 알림창(미완료 항목 안내) */}
      {alertMessage ? (
        <AlertModal message={alertMessage} onClose={() => setAlertMessage(null)} />
      ) : null}
    </div>
  );
}

// 필수 표시(빨간 별표).
function Dot() {
  return <span className="ml-0.5 align-middle text-[13px] text-red-500">*</span>;
}

// 비밀번호 표시/숨김 토글(눈 아이콘). 입력칸 우측에 겹쳐 배치.
function PasswordToggle({
  shown,
  onToggle,
}: {
  shown: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? "비밀번호 숨기기" : "비밀번호 보기"}
      className="absolute right-3 top-1/2 flex h-[22px] w-[22px] -translate-y-1/2 items-center justify-center text-[#9b9b9b]"
    >
      {shown ? (
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
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[15px] font-medium text-[#252525]">
        {label}
        <Dot />
      </span>
      {children}
    </div>
  );
}

function Hint({
  tone,
  children,
}: {
  tone: "ok" | "err" | "muted";
  children: React.ReactNode;
}) {
  const color =
    tone === "ok"
      ? "text-[#22a36b]"
      : tone === "err"
        ? "text-error"
        : "text-[#9b9b9b]";
  return <p className={`text-[13px] ${color}`}>{children}</p>;
}

// 소셜 계정에 이메일/비밀번호 credential을 연결한다. 이미 연결돼 있으면 성공으로 본다(멱등).
async function linkSocialPassword(
  email: string,
  password: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { auth } = getFirebaseClient();
  const user = auth.currentUser;
  if (!user) {
    return {
      ok: false,
      message: "로그인 세션이 만료됐습니다. 처음부터 다시 시도해 주세요.",
    };
  }
  if (!email) {
    return {
      ok: false,
      message: "소셜 계정에서 이메일을 받지 못해 비밀번호를 설정할 수 없습니다.",
    };
  }
  try {
    await linkWithCredential(user, EmailAuthProvider.credential(email, password));
    return { ok: true };
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    if (code === "auth/provider-already-linked") {
      return { ok: true };
    }
    if (code === "auth/email-already-in-use") {
      return {
        ok: false,
        message: "이미 사용 중인 이메일입니다. 다른 방식으로 로그인해 주세요.",
      };
    }
    if (code === "auth/requires-recent-login") {
      return {
        ok: false,
        message: "보안을 위해 다시 로그인한 뒤 비밀번호를 설정해 주세요.",
      };
    }
    if (
      code === "auth/weak-password" ||
      code === "auth/password-does-not-meet-requirements"
    ) {
      return {
        ok: false,
        message:
          "비밀번호가 약합니다. 8자 이상이며 영문 소문자·숫자·특수문자를 포함해 주세요.",
      };
    }
    return { ok: false, message: "비밀번호 설정에 실패했습니다. 다시 시도해 주세요." };
  }
}
