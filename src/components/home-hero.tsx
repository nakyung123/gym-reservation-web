/**
 * 홈 히어로(풀스크린 통배경). 코트 일러스트(public/hero-court.png)를 화면 전체 폭 배경으로
 * 깔고, 좌측에 제목/본문/CTA 2개를 얹는다. 일러스트가 밝으므로 좌→우 흰(크림) 베일로
 * 좌측 텍스트 가독성만 보강한다.
 *
 * 하단 여백(pb)은 검색바(home-search)가 -40px로 겹쳐 올라올 공간이다.
 * 이미지는 next/image fill + priority(첫 화면)로, 큰 원본이라도 기기에 맞는 최적화본만 전송된다.
 */
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function HomeHero() {
  const t = await getTranslations("Home");
  return (
    <section className="relative flex min-h-[100svh] items-center overflow-hidden bg-[#f4efe8]">
      {/* 배경 일러스트(전체 폭) */}
      <Image
        src="/hero-court.png"
        alt=""
        fill
        priority
        quality={90}
        sizes="100vw"
        className="object-cover object-[62%_38%]"
      />
      {/* 좌측 텍스트 가독성용 흰 베일(밝은 일러스트라 크림→투명) */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(100deg,rgba(244,239,232,0.95)_0%,rgba(244,239,232,0.82)_28%,rgba(244,239,232,0.35)_50%,rgba(244,239,232,0.05)_68%,rgba(244,239,232,0)_80%)]"
      />

      <div className="relative mx-auto flex w-full max-w-[1440px] flex-col px-5 sm:px-8">
        <h1 className="text-[34px] font-extrabold leading-[1.26] tracking-[-0.025em] text-accent-strong sm:text-[46px]">
          {t("heroTitleLine1")}
          <br />
          {t("heroTitleLine2")}
        </h1>
        <p className="mt-[18px] max-w-[460px] text-base font-medium leading-[1.7] text-slate-600 sm:text-[18px]">
          {t("heroSubtitle")}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/gyms"
            className="inline-flex h-14 items-center gap-2 rounded-[10px] bg-accent px-6 text-[15px] font-bold text-white transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            시설 검색하기
            <span aria-hidden="true">→</span>
          </Link>
          <Link
            href="/guide"
            className="inline-flex h-14 items-center gap-2 rounded-[10px] border border-accent bg-white/90 px-6 text-[15px] font-bold text-accent-strong backdrop-blur-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            이용 방법 안내
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>

      {/* 스크롤 유도: 하단 중앙에 흰 원 + 아래 화살표(통통 튀는 애니메이션). 장식 요소라
          aria-hidden. 스크롤을 아래로 유도한다. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-4 flex justify-center"
      >
        <span className="flex h-9 w-9 animate-bounce items-center justify-center rounded-full bg-white shadow-[0_4px_14px_rgba(15,23,42,0.18)]">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4 text-accent-strong"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </div>
    </section>
  );
}
