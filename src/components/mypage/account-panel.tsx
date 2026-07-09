"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type {
  ProfileState,
  ProfileTextField,
  SaveState,
} from "@/hooks/use-user-profile-form";
import { FieldLabel, INPUT_CLASS, READONLY_INPUT_CLASS } from "./account-fields";
import { PasswordChangeInline } from "./password-change-inline";
import { WithdrawModal } from "./withdraw-modal";

/**
 * 회원정보변경 패널: KMI 폼
 * (성명 / 아이디 / 이메일 / 생년월일 / 비밀번호 변경 / 연락처 / 주소 + 정보수정·회원탈퇴).
 *
 * 데이터 수명주기(로드/저장)는 use-user-profile-form 훅이 담당하고,
 * 이 컴포넌트는 상태 표현과 입력만 담당한다(SRP).
 */
export function AccountPanel({
  email,
  isPasswordProvider,
  profileState,
  saveState,
  onFieldChange,
  onSubmit,
  onRelock,
}: {
  email: string;
  isPasswordProvider: boolean;
  profileState: ProfileState;
  saveState: SaveState;
  onFieldChange: (field: ProfileTextField, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /** 비밀번호 재인증 시한 만료 시 게이트를 다시 잠근다. */
  onRelock: () => void;
}) {
  const t = useTranslations("Mypage");
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  // ── 프로필 로드 상태별 얼리 리턴 ──
  if (profileState.status === "loading" || profileState.status === "idle") {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <div
          className="rounded-md border border-line bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-600"
          aria-live="polite"
          aria-busy="true"
        >
          {t("profileLoading")}
        </div>
      </div>
    );
  }

  if (profileState.status === "error") {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <div
          className="rounded-md border border-error/30 bg-error/10 px-4 py-4 text-sm leading-6 text-error"
          role="alert"
        >
          <p className="font-bold">{t("profileErrorTitle")}</p>
          <p className="mt-1">{profileState.message}</p>
        </div>
      </div>
    );
  }

  const { form } = profileState;
  const isSaving = saveState.status === "saving";

  return (
    <div className="mx-auto w-full max-w-2xl">
      <p className="mb-3 text-right text-xs text-error">{t("accountRequired")}</p>
      <section className="rounded-2xl border border-line bg-surface-2/40 p-6 sm:p-8">
        <form className="flex flex-col gap-5" onSubmit={onSubmit} noValidate>
          {/* 성명 */}
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor="account-name">{t("accountNameLabel")}</FieldLabel>
            <input
              id="account-name"
              type="text"
              value={form.name}
              onChange={(e) => onFieldChange("name", e.target.value)}
              maxLength={30}
              placeholder={t("namePlaceholder")}
              disabled={isSaving}
              className={INPUT_CLASS}
            />
          </div>

          {/* 아이디(로그인 식별자) - 읽기 전용. 아이디 미설정 계정(레거시/미완성)은 행을 숨긴다. */}
          {profileState.loginId ? (
            <div className="flex flex-col gap-2">
              <FieldLabel htmlFor="account-id" required>
                {t("accountIdLabel")}
              </FieldLabel>
              <input
                id="account-id"
                type="text"
                value={profileState.loginId}
                readOnly
                disabled
                className={READONLY_INPUT_CLASS}
              />
              <p className="text-xs text-slate-500">{t("loginIdReadonlyHint")}</p>
            </div>
          ) : null}

          {/* 이메일 - 읽기 전용 */}
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor="account-email" required>
              {t("accountEmailLabel")}
            </FieldLabel>
            <input
              id="account-email"
              type="email"
              value={email}
              readOnly
              disabled
              className={READONLY_INPUT_CLASS}
            />
            <p className="text-xs text-slate-500">{t("emailReadonlyHint")}</p>
          </div>

          {/* 생년월일 */}
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor="account-birth">{t("birthDateLabel")}</FieldLabel>
            <input
              id="account-birth"
              type="date"
              value={form.birthDate}
              onChange={(e) => onFieldChange("birthDate", e.target.value)}
              disabled={isSaving}
              className={`${INPUT_CLASS} sm:w-[220px]`}
            />
          </div>

          {/* 비밀번호 변경 (비번 회원만, KMI: 현재 비번 없이 새 비번+확인) */}
          {isPasswordProvider ? (
            <PasswordChangeInline onRelock={onRelock} disabled={isSaving} />
          ) : null}

          {/* 연락처 */}
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor="account-phone">{t("phoneLabel")}</FieldLabel>
            <input
              id="account-phone"
              type="tel"
              inputMode="numeric"
              value={form.phone}
              onChange={(e) => onFieldChange("phone", e.target.value)}
              maxLength={20}
              placeholder={t("phonePlaceholder")}
              disabled={isSaving}
              className={INPUT_CLASS}
            />
          </div>

          {/* 주소 */}
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor="account-address">{t("addressLabel")}</FieldLabel>
            <input
              id="account-address"
              type="text"
              value={form.address}
              onChange={(e) => onFieldChange("address", e.target.value)}
              maxLength={200}
              placeholder={t("addressPlaceholder")}
              disabled={isSaving}
              className={INPUT_CLASS}
            />
          </div>

          {/* 저장 결과: 성공/실패를 같은 자리에 모아 표시한다 */}
          {saveState.status === "success" ? (
            <div
              className="rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm font-semibold text-success"
              role="status"
            >
              {saveState.message}
            </div>
          ) : null}
          {saveState.status === "error" ? (
            <div
              className="rounded-md border border-error/30 bg-error/10 px-4 py-3 text-sm leading-6 text-error"
              role="alert"
            >
              <p className="font-bold">{t("profileSaveErrorTitle")}</p>
              <p className="mt-1">{saveState.message}</p>
            </div>
          ) : null}

          {/* 하단 버튼: 회원탈퇴 · 정보수정 */}
          <div className="mt-2 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => setWithdrawOpen(true)}
              className="inline-flex h-11 items-center justify-center rounded-md border border-line-strong bg-white px-6 text-sm font-semibold text-slate-700 transition hover:border-error/40 hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {t("withdrawButton")}
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-6 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              {isSaving ? t("saving") : t("saveProfile")}
            </button>
          </div>
        </form>
      </section>

      {withdrawOpen ? (
        <WithdrawModal
          isPasswordProvider={isPasswordProvider}
          onClose={() => setWithdrawOpen(false)}
        />
      ) : null}
    </div>
  );
}
