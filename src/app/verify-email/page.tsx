import Link from "next/link";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "이메일 인증 — 공공체육관 예약",
};

// Firebase Auth action link가 인증 자체를 처리하므로 별도 UI는 안내만 제공한다.
// 사용자가 이메일 인증 링크를 클릭하면 Firebase 호스팅 페이지에서 처리되고,
// 이 페이지는 안내/마이페이지 이동 동선만 담당한다.
export default async function VerifyEmailPage() {
  const t = await getTranslations("Auth");
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md items-center justify-center px-4 py-10">
      <section className="w-full rounded-lg border border-line bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold text-slate-950">{t("verifyTitle")}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{t("verifyBody")}</p>
        <p className="mt-5">
          <Link
            href="/mypage"
            className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover"
          >
            {t("verifyToMypage")}
          </Link>
        </p>
      </section>
    </main>
  );
}
