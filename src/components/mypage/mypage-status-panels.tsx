"use client";

import { useTranslations } from "next-intl";

/**
 * 마이페이지 인증 상태별 전면 패널 3종.
 * - LoadingPanel  : 세션 복원 중 (aria-live + 스피너)
 * - ErrorPanel    : 인증 확인 실패 (role="alert", 메시지 그대로 노출)
 * - SignedOutPanel: 미로그인 안내 (리다이렉트는 useRequireAuth가 담당)
 */

export function LoadingPanel() {
  const t = useTranslations("Mypage");
  return (
    <section
      className="mx-auto w-full max-w-4xl rounded-2xl border border-line bg-white p-8 text-center shadow-sm"
      aria-live="polite"
      aria-busy="true"
    >
      <p className="text-sm font-semibold text-accent-strong">{t("eyebrow")}</p>
      <h1 className="mt-2 break-keep text-2xl font-bold text-slate-950 sm:text-3xl">
        {t("loadingTitle")}
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">{t("loadingDesc")}</p>
      <div className="mt-6 flex justify-center" aria-hidden="true">
        <span className="size-8 animate-spin rounded-full border-2 border-line border-t-accent" />
      </div>
    </section>
  );
}

export function ErrorPanel({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  const t = useTranslations("Mypage");
  return (
    <section
      className="mx-auto w-full max-w-4xl rounded-2xl border border-error/30 bg-error/10 p-8 text-center text-error shadow-sm"
      role="alert"
    >
      <p className="text-sm font-semibold">{t("eyebrow")}</p>
      <h1 className="mt-2 break-keep text-2xl font-bold sm:text-3xl">{title}</h1>
      <p className="mt-3 text-sm leading-6">{message}</p>
    </section>
  );
}

export function SignedOutPanel() {
  const t = useTranslations("Mypage");
  return (
    <section className="mx-auto w-full max-w-4xl rounded-2xl border border-line bg-white p-8 text-center shadow-sm">
      <p className="text-sm font-semibold text-accent-strong">{t("eyebrow")}</p>
      <h1 className="mt-2 break-keep text-2xl font-bold text-slate-950 sm:text-3xl">
        {t("signedOutTitle")}
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        {t("signedOutDesc")}
      </p>
    </section>
  );
}
