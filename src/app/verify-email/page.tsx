import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "이메일 인증 — 공공체육관 예약",
};

// Firebase Auth action link가 인증 자체를 처리하므로 별도 UI는 안내만 제공한다.
// 사용자가 이메일 인증 링크를 클릭하면 Firebase 호스팅 페이지에서 처리되고,
// 이 페이지는 안내/마이페이지 이동 동선만 담당한다.
export default function VerifyEmailPage() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md items-center justify-center px-4 py-10">
      <section className="w-full rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold text-slate-950">이메일 인증 안내</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          가입 시 발송된 이메일에서 인증 링크를 클릭해 주세요. 인증을 완료하지
          않아도 로그인과 예약은 가능합니다.
        </p>
        <p className="mt-5">
          <Link
            href="/mypage"
            className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            마이페이지로
          </Link>
        </p>
      </section>
    </main>
  );
}
