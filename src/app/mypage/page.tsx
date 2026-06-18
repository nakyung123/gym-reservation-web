import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MypageView } from "@/components/mypage-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Mypage");
  return {
    title: t("metaTitle"),
    description: t("metaDesc"),
  };
}

export default function MypagePage() {
  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 lg:px-10">
      <MypageView />
    </main>
  );
}
