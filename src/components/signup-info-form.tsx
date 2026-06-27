"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { EmailAuthProvider, linkWithCredential } from "firebase/auth";
import { signupWithEmail } from "@/lib/firebase-email-auth";
import { getFirebaseClient } from "@/lib/firebase-client";
import {
  checkLoginIdAvailability,
  setLoginId,
} from "@/lib/login-id-client";
import {
  ensureUserProfile,
  saveUserProfile,
} from "@/lib/user-profile-client";
import {
  PASSWORD_POLICY_HINT,
  validatePasswordPolicy,
} from "@/lib/password-policy";
import {
  LOGIN_ID_HINT,
  validateLoginId,
  validateUserProfileInput,
} from "@/lib/user-profile";
import { PasswordField, TextField } from "@/components/form-fields";

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

type SubmitState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string };

export function SignupInfoForm({
  mode,
  prefilledEmail,
  onComplete,
}: {
  mode: Mode;
  prefilledEmail?: string;
  onComplete: (result: { emailVerificationSent: boolean }) => void;
}) {
  const t = useTranslations("Auth");

  const [loginId, setLoginIdValue] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState(prefilledEmail ?? "");
  const [idCheck, setIdCheck] = useState<IdCheck>({ status: "idle" });
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });

  // 다단계 진행 가드. 재시도 시 완료된 단계를 건너뛴다.
  const accountReadyRef = useRef(false);
  const loginIdSetRef = useRef(false);
  const emailVerificationSentRef = useRef(false);

  const emailLocked = mode === "social";

  // 빈 값은 "아직 입력 안 함"으로 보고 인라인 에러를 띄우지 않는다.
  const loginIdValidation = validateLoginId(loginId);
  const loginIdError =
    loginId.length > 0 && !loginIdValidation.ok
      ? loginIdValidation.message
      : null;
  const passwordError = validatePasswordPolicy(password);
  const passwordConfirmError =
    passwordConfirm.length > 0 && passwordConfirm !== password
      ? t("passwordMismatch")
      : null;

  const isLoading = submitState.kind === "loading";
  const isFormValid =
    idCheck.status === "available" &&
    password.length > 0 &&
    passwordConfirm.length > 0 &&
    !passwordError &&
    !passwordConfirmError &&
    name.trim().length > 0 &&
    birthDate.trim().length > 0 &&
    phone.trim().length > 0 &&
    email.trim().length > 0;

  function handleLoginIdChange(value: string) {
    setLoginIdValue(value);
    // 입력이 바뀌면 직전 중복확인 결과를 무효화한다.
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
        ? { status: "invalid", message: t("loginIdInvalid") }
        : { status: "taken" },
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isFormValid) return;
    setSubmitState({ kind: "loading" });

    // 1단계: 계정 준비 (email=계정 생성, social=비밀번호 연결).
    if (!accountReadyRef.current) {
      if (mode === "email") {
        const created = await signupWithEmail({ email: email.trim(), password });
        if (!created.ok) {
          setSubmitState({ kind: "error", message: created.message });
          return;
        }
        accountReadyRef.current = true;
        emailVerificationSentRef.current = created.emailVerificationSent;
      } else {
        const linked = await linkSocialPassword(email.trim(), password);
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
        // taken 경쟁 등. 아이디 단계만 다시 시도하도록 중복확인을 초기화한다.
        setIdCheck({ status: "taken" });
        setSubmitState({ kind: "error", message: idResult.message });
        return;
      }
      loginIdSetRef.current = true;
    }

    // 4단계: 회원정보 저장(성명·생년월일·연락처).
    const validation = validateUserProfileInput({
      name: name.trim(),
      phone: phone.trim(),
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

    onComplete({ emailVerificationSent: emailVerificationSentRef.current });
  }

  return (
    <section className="w-full rounded-lg border border-line bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold text-slate-950">{t("infoTitle")}</h1>
      <p className="mt-1 text-sm text-slate-600">{t("infoSubtitle")}</p>

      <form className="mt-5 flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
        <div className="flex flex-col gap-1">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <TextField
                label={t("loginId")}
                type="text"
                autoComplete="username"
                value={loginId}
                onChange={handleLoginIdChange}
                error={loginIdError}
                hint={loginIdError ? null : LOGIN_ID_HINT}
              />
            </div>
            <button
              type="button"
              onClick={handleCheckId}
              disabled={isLoading || idCheck.status === "checking"}
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-md border border-line-strong bg-white px-3 text-sm font-semibold text-slate-800 transition hover:border-accent disabled:cursor-not-allowed disabled:border-line disabled:text-slate-400"
            >
              {idCheck.status === "checking" ? t("loginIdChecking") : t("loginIdCheck")}
            </button>
          </div>
          <IdCheckMessage idCheck={idCheck} t={t} />
        </div>

        <PasswordField
          label={t("password")}
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          error={passwordError}
          hint={PASSWORD_POLICY_HINT}
        />
        <PasswordField
          label={t("passwordConfirm")}
          autoComplete="new-password"
          value={passwordConfirm}
          onChange={setPasswordConfirm}
          error={passwordConfirmError}
        />
        <TextField
          label={t("name")}
          type="text"
          autoComplete="name"
          value={name}
          onChange={setName}
        />
        <TextField
          label={t("birthDate")}
          type="text"
          inputMode="numeric"
          placeholder="YYYY-MM-DD"
          value={birthDate}
          onChange={setBirthDate}
          hint={t("birthDateHint")}
        />
        <TextField
          label={t("phone")}
          type="text"
          inputMode="tel"
          autoComplete="tel"
          placeholder="010-1234-5678"
          value={phone}
          onChange={setPhone}
        />
        <TextField
          label={t("email")}
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          disabled={emailLocked}
          hint={emailLocked ? t("emailFromSocial") : null}
        />

        <button
          type="submit"
          disabled={isLoading || !isFormValid}
          className="mt-1 inline-flex h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isLoading ? t("signupSubmitting") : t("signupSubmit")}
        </button>
      </form>

      {submitState.kind === "error" ? (
        <p
          className="mt-3 rounded-md border border-error/30 bg-error/10 px-3 py-2 text-sm text-error"
          role="alert"
        >
          {submitState.message}
        </p>
      ) : null}
    </section>
  );
}

function IdCheckMessage({
  idCheck,
  t,
}: {
  idCheck: IdCheck;
  t: ReturnType<typeof useTranslations>;
}) {
  if (idCheck.status === "available") {
    return (
      <p className="text-xs font-semibold text-success">{t("loginIdAvailable")}</p>
    );
  }
  if (idCheck.status === "taken") {
    return <p className="text-xs font-semibold text-error">{t("loginIdTaken")}</p>;
  }
  if (idCheck.status === "invalid" || idCheck.status === "error") {
    return <p className="text-xs font-semibold text-error">{idCheck.message}</p>;
  }
  return null;
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
    // 이미 비밀번호가 연결된 계정이면 그대로 진행한다.
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
