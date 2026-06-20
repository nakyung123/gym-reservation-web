/**
 * 홈 히어로(시안 D안). 배드민턴 코트 일러스트(public/hero-badminton.png)를 배경으로 깔고,
 * 좌측 밝은 영역(크림색 벽) 위에 어두운 제목/본문을 얹는다. 일러스트가 밝으므로
 * 흰색 베일(좌→우 투명)로 좌측 텍스트 가독성만 보강한다.
 *
 * 하단 여백(pb-[60px])은 검색바(home-search)가 -40px로 겹쳐 올라올 공간이다.
 * 일러스트는 next/image fill + priority(첫 화면). object-position으로 인물이 보이게 잡는다.
 */
import Image from "next/image";
import { getTranslations } from "next-intl/server";

export async function HomeHero() {
  const t = await getTranslations("Home");
  return (
    <section className="relative h-[440px] overflow-hidden bg-[#f4efe8] sm:h-[460px]">
      {/* 배경 일러스트 */}
      <Image
        src="/hero-badminton.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-[68%_32%]"
      />
      {/* 좌측 텍스트 가독성용 흰 베일(밝은 일러스트라 흰→투명) */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(100deg,rgba(244,239,232,0.94)_0%,rgba(244,239,232,0.7)_34%,rgba(244,239,232,0.1)_60%,rgba(244,239,232,0)_78%)]"
      />

      <div className="relative mx-auto flex h-full w-full max-w-[1440px] flex-col justify-center px-5 pb-[60px] sm:px-8">
        <h1 className="max-w-[680px] text-[34px] font-extrabold leading-[1.26] tracking-[-0.025em] text-slate-900 sm:text-[46px]">
          {t("heroTitleLine1")}
          <br />
          {t("heroTitleLine2")}
        </h1>
        <p className="mt-[18px] max-w-[620px] text-base font-medium text-slate-700 sm:text-[19px]">
          {t("heroSubtitle")}
        </p>
      </div>
    </section>
  );
}
