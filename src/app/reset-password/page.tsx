import { ResetPasswordView } from "@/components/reset-password-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "비밀번호 재설정 — 공공체육관 예약",
};

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md items-center justify-center px-4 py-10">
      <ResetPasswordView />
    </main>
  );
}
