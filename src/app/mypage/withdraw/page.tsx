import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WithdrawView } from "@/components/withdraw-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Withdraw");
  return {
    title: t("metaTitle"),
    description: t("metaDesc"),
  };
}

export default function WithdrawPage() {
  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 lg:px-10">
      <div className="mx-auto w-full max-w-md">
        <WithdrawView />
      </div>
    </main>
  );
}
