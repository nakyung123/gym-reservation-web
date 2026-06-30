import { ResetPasswordView } from "@/components/reset-password-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "비밀번호 재설정 — 서울체육예약",
};

export default function ResetPasswordPage() {
  return (
    <main className="w-full">
      <ResetPasswordView />
    </main>
  );
}
