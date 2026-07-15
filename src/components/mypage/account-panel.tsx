"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type {
  ProfileState,
  ProfileTextField,
  SaveState,
} from "@/hooks/use-user-profile-form";
import { formatBirthDate, formatPhone } from "@/lib/input-format";
import { AlertModal } from "@/components/ui/alert-modal";
import { FieldLabel, INPUT_CLASS, READONLY_INPUT_CLASS } from "./account-fields";
import { PasswordChangeInline } from "./password-change-inline";
import { AccountWithdrawSection } from "./account-withdraw-section";

/**
 * 회원정보변경 패널.
 *
 * 필드 순서: 성명 / 아이디 / 생년월일 / 비밀번호·비밀번호 확인·비밀번호 변경 / 연락처 / 이메일.
 * (주소·성별은 제공하지 않는다.) 이메일은 로그인 식별자라 읽기 전용으로 표시만 한다.
 *
 * 데이터 수명주기(로드/저장)는 use-user-profile-form 훅이 담당하고,
 * 이 컴포넌트는 상태 표현과 입력만 담당한다(SRP). 회원탈퇴는 팝업 대신
 * 이 탭 안에서 인라인 섹션(AccountWithdrawSection)으로 전환해 노출한다.
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
  // 회원정보 폼 ↔ 회원탈퇴 인라인 섹션 전환.
  const [showWithdraw, setShowWithdraw] = useState(false);
  // 저장 성공 시 "수정되었습니다" 알림창.
  const [savedAlertOpen, setSavedAlertOpen] = useState(false);
  // 저장 상태가 success로 '바뀌는' 순간을 렌더 중 감지해 알림을 연다(effect 없이,
  // React 공식 "렌더 중 상태 보정" 패턴 — mypage-view의 게이트 리셋과 동일).
  const [prevSaveStatus, setPrevSaveStatus] = useState(saveState.status);
  if (prevSaveStatus !== saveState.status) {
    setPrevSaveStatus(saveState.status);
    if (saveState.status === "success") setSavedAlertOpen(true);
  }

  // ── 프로필 로드 상태별 얼리 리턴 ──
  if (profileState.status === "loading" || profileState.status === "idle") {
    return (
      <div className="mx-auto w-[800px] max-w-full">
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
      <div className="mx-auto w-[800px] max-w-full">
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

  // 회원탈퇴 인라인 섹션(폼 대체).
  if (showWithdraw) {
    return (
      <AccountWithdrawSection
        isPasswordProvider={isPasswordProvider}
        onCancel={() => setShowWithdraw(false)}
      />
    );
  }

  const { form } = profileState;
  const isSaving = saveState.status === "saving";

  // 이메일은 로그인 식별자라 읽기 전용. VOC 문의 폼과 동일한 3칸(로컬 @ 도메인) 레이아웃으로 표시만 한다.
  const [emailLocal, emailDomain] = email.includes("@")
    ? [email.slice(0, email.indexOf("@")), email.slice(email.indexOf("@") + 1)]
    : [email, ""];
  const readonlyEmailBox =
    "h-[56px] max-w-full cursor-not-allowed rounded-md border border-line bg-[#e4e4e4] px-4 text-[16px] text-slate-600";

  return (
    <div className="mx-auto w-[800px] max-w-full">
      {/* 필수 안내: 검은 16px, 별표만 빨강 */}
      <p className="mb-3 text-right text-[16px] text-slate-900">
        <span className="text-error">*</span> {t("accountRequired")}
      </p>

      {/* 정보 박스: 800 폭, padding 60, 테두리 없이 옅은 회색 */}
      <section className="rounded-2xl bg-surface-2 p-[60px]">
        <form className="flex flex-col gap-6" onSubmit={onSubmit} noValidate>
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

          {/* 아이디(로그인 식별자) - 읽기 전용. 미설정 계정(레거시)은 행을 숨긴다. */}
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
            </div>
          ) : null}

          {/* 생년월일 — 직접 입력(YYYY-MM-DD), 숫자 입력 시 자동 하이픈 */}
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor="account-birth">{t("birthDateLabel")}</FieldLabel>
            <input
              id="account-birth"
              type="text"
              inputMode="numeric"
              value={form.birthDate}
              onChange={(e) =>
                onFieldChange("birthDate", formatBirthDate(e.target.value))
              }
              maxLength={10}
              placeholder="YYYY-MM-DD"
              disabled={isSaving}
              className={INPUT_CLASS}
            />
          </div>

          {/* 비밀번호 · 비밀번호 확인 · 비밀번호 변경 (비번 회원만) */}
          {isPasswordProvider ? (
            <PasswordChangeInline onRelock={onRelock} disabled={isSaving} />
          ) : null}

          {/* 연락처 — 숫자 입력 시 자동 하이픈 */}
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor="account-phone">{t("phoneLabel")}</FieldLabel>
            <input
              id="account-phone"
              type="tel"
              inputMode="numeric"
              value={form.phone}
              onChange={(e) => onFieldChange("phone", formatPhone(e.target.value))}
              maxLength={13}
              placeholder={t("phonePlaceholder")}
              disabled={isSaving}
              className={INPUT_CLASS}
            />
          </div>

          {/* 이메일 — 읽기 전용(로그인 식별자). VOC 문의 폼과 동일한 3칸 레이아웃. */}
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor="account-email" required>
              {t("accountEmailLabel")}
            </FieldLabel>
            <div className="flex items-center gap-2">
              <input
                id="account-email"
                type="text"
                value={emailLocal}
                readOnly
                disabled
                aria-label={t("accountEmailLabel")}
                className={`${readonlyEmailBox} w-[214.84px] flex-1`}
              />
              <span aria-hidden="true" className="text-[16px] text-slate-900">
                @
              </span>
              <input
                type="text"
                value={emailDomain}
                readOnly
                disabled
                aria-label={`${t("accountEmailLabel")} 도메인`}
                className={`${readonlyEmailBox} w-[214.83px] flex-1`}
              />
              <div className="relative w-[212.75px] max-w-full shrink-0">
                <select
                  disabled
                  value="direct"
                  aria-label={`${t("accountEmailLabel")} 도메인 선택`}
                  className={`${readonlyEmailBox} w-full appearance-none pr-10`}
                >
                  <option value="direct">직접입력</option>
                </select>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </div>
          </div>

          {/* 저장 실패는 인라인으로 유지(성공은 알림창으로 안내). */}
          {saveState.status === "error" ? (
            <div
              className="rounded-md border border-error/30 bg-error/10 px-4 py-3 text-[16px] leading-6 text-error"
              role="alert"
            >
              <p className="font-bold">{t("profileSaveErrorTitle")}</p>
              <p className="mt-1">{saveState.message}</p>
            </div>
          ) : null}

          {/* 하단 버튼: 회원탈퇴 · 정보수정 (각 160×60, 18px, radius 30).
              위 간격 68px = 폼 gap-6(24px) + mt-[44px]. 회원탈퇴는 hover 시 네이비. */}
          <div className="mt-[44px] flex justify-center gap-3">
            <button
              type="button"
              onClick={() => setShowWithdraw(true)}
              className="inline-flex h-[60px] w-[160px] items-center justify-center rounded-[30px] border border-line-strong bg-white text-[18px] font-semibold text-slate-700 transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {t("withdrawButton")}
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex h-[60px] w-[160px] items-center justify-center rounded-[30px] bg-accent text-[18px] font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              {isSaving ? t("saving") : t("saveProfile")}
            </button>
          </div>
        </form>
      </section>

      {/* 저장 성공 알림창 */}
      {savedAlertOpen ? (
        <AlertModal
          message={t("profileSavedAlert")}
          onClose={() => setSavedAlertOpen(false)}
        />
      ) : null}
    </div>
  );
}
