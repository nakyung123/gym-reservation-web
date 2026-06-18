import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PasswordChangeView } from "@/components/password-change-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Password");
  return {
    title: t("metaTitle"),
    description: t("metaDesc"),
  };
}

export default function PasswordChangePage() {
  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 lg:px-10">
      <div className="mx-auto w-full max-w-md">
        <PasswordChangeView />
      </div>
    </main>
  );
}
