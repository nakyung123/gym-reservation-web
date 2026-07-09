import Link from "next/link";
import { getTranslations } from "next-intl/server";

// 커스텀 404: Next 기본 영문 화면 대신 서비스 톤의 안내와 복귀 경로(홈·시설 찾기)를 준다.
// 루트 layout(헤더·푸터) 안에서 렌더되며, 문구는 NotFound 네임스페이스(ko/en)를 쓴다.
export default async function NotFound() {
  const t = await getTranslations("NotFound");
  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-col items-center px-5 py-24 text-center sm:px-8 sm:py-32">
      <p className="text-[15px] font-bold tracking-[0.08em] text-accent-strong">
        404
      </p>
      <h1 className="mt-3 text-[26px] font-extrabold tracking-[-0.02em] text-foreground sm:text-[32px]">
        {t("title")}
      </h1>
      <p className="mt-4 max-w-[480px] text-[15px] leading-relaxed text-muted">
        {t("description")}
      </p>
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="inline-flex h-12 items-center rounded-[10px] bg-accent px-6 text-[15px] font-bold text-white transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          {t("homeCta")}
        </Link>
        <Link
          href="/gyms"
          className="inline-flex h-12 items-center rounded-[10px] border border-accent bg-white px-6 text-[15px] font-bold text-accent-strong transition hover:bg-accent-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          {t("gymsCta")}
        </Link>
      </div>
    </main>
  );
}
