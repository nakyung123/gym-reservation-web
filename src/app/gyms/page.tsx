import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { GymDiscovery } from "@/components/gym-discovery";
import { gymRepository } from "@/lib/gym-repository-provider";

export default async function GymsPage() {
  const gyms = await gymRepository.list();
  const t = await getTranslations("Gyms");

  return (
    <main className="mx-auto w-full max-w-[1440px] px-5 py-10 text-foreground sm:px-8 sm:py-12">
      {/* breadcrumb (공지·FAQ와 동일 톤) */}
      <nav aria-label="breadcrumb" className="text-[13px] text-muted">
        <ol className="flex items-center gap-1.5">
          <li>
            <Link href="/" className="transition hover:text-accent-strong">
              {t("breadcrumbHome")}
            </Link>
          </li>
          <li aria-hidden="true" className="text-line-strong">
            /
          </li>
          <li className="font-semibold text-foreground">{t("title")}</li>
        </ol>
      </nav>

      {/* 헤더 */}
      <h1 className="mt-4 text-[28px] font-bold text-foreground sm:text-[32px]">
        {t("title")}
      </h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
        {t("subtitle")}
      </p>

      <div className="mt-9">
        <GymDiscovery gyms={gyms} />
      </div>
    </main>
  );
}
