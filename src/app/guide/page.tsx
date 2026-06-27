import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

// 이용 방법 = "현장에서 이렇게 이용합니다"를 보여주는 4단계 안내.
//   KMI 'KMI 특별함'(INTDS/SPECIAL)의 01~04 교차 블록을 실측해 그대로 옮긴다:
//   이미지 박스 3:2(599×419)·radius 20, 좌우 ~50/50, 01 이미지 좌측 시작으로 블록마다 교차,
//   번호 라벨(18/700·accent) + 굵은 제목 + 설명. 색만 우리 네이비 토큰.
// 이미지 자리는 단계별 실제 일러스트(public/guide/step{n}.jpg)를 쓴다.
// 단계 내용은 STEPS 배열 + Guide 네임스페이스(i18n)에서 관리한다. (구조 유연성 우선)

export const metadata: Metadata = {
  title: "이용 방법 — 서울체육예약",
  description: "예약 QR 준비부터 현장 인식·입장·완료까지, 현장 이용 방법을 단계별로 안내합니다.",
};

type GuideStep = {
  titleKey: string;
  descKey: string;
  tipsKey: string;
  image: string;
};

// 현장 순서: 예약 QR 준비 → 현장 QR 인식 → 입장·이용 → 이용 완료
//   각 단계는 일러스트(image) + 본문 설명(descKey) + 준수/안내 체크리스트(tipsKey, 배열)로 구성한다.
const STEPS: GuideStep[] = [
  { titleKey: "step1Title", descKey: "step1Desc", tipsKey: "step1Tips", image: "/guide/step1.webp" },
  { titleKey: "step2Title", descKey: "step2Desc", tipsKey: "step2Tips", image: "/guide/step2.webp" },
  { titleKey: "step3Title", descKey: "step3Desc", tipsKey: "step3Tips", image: "/guide/step3.webp" },
  { titleKey: "step4Title", descKey: "step4Desc", tipsKey: "step4Tips", image: "/guide/step4.webp" },
];

export default async function GuidePage() {
  const t = await getTranslations("Guide");

  return (
    <main className="bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1440px] px-5 py-10 sm:px-8 sm:py-12">
        {/* breadcrumb */}
        <nav aria-label="breadcrumb" className="text-[13px] text-muted">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link href="/" className="transition hover:text-accent-strong">
                홈
              </Link>
            </li>
            <li aria-hidden="true" className="text-line-strong">
              /
            </li>
            <li className="font-semibold text-foreground">{t("title")}</li>
          </ol>
        </nav>

        {/* 헤더 */}
        <p className="mt-4 text-[13px] font-bold tracking-[0.08em] text-accent-strong">
          GUIDE
        </p>
        <h1 className="mt-2 text-[28px] font-extrabold tracking-[-0.02em] text-slate-950 sm:text-[34px]">
          {t("title")}
        </h1>
        <p className="mt-2 max-w-2xl text-[16px] leading-relaxed text-muted sm:text-[17px]">
          {t("intro")}
        </p>

        {/* 01~04 교차 블록 (KMI 특별함 실측: 3:2 radius20, ~50/50, 좌우 교차) */}
        <ol className="mt-14 space-y-16 sm:mt-20 sm:space-y-24">
          {STEPS.map((step, index) => {
            const imageLeft = index % 2 === 0; // 01 이미지 좌측 시작 → 블록마다 교차
            return (
              <li
                key={step.titleKey}
                className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16"
              >
                <div className={imageLeft ? "lg:order-1" : "lg:order-2"}>
                  <div className="relative aspect-[3/2] overflow-hidden rounded-[20px] bg-accent-tint/55">
                    <Image
                      src={step.image}
                      alt={t(step.titleKey)}
                      fill
                      quality={90}
                      sizes="(max-width: 1024px) 100vw, 600px"
                      className="object-cover"
                    />
                  </div>
                </div>
                <div
                  className={`${imageLeft ? "lg:order-2" : "lg:order-1 lg:text-right"}`}
                >
                  <span className="text-[18px] font-bold tracking-[0.06em] text-accent-strong tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h2 className="mt-2 text-[26px] font-extrabold leading-[1.3] tracking-[-0.02em] text-slate-950 sm:text-[30px]">
                    {t(step.titleKey)}
                  </h2>
                  <p
                    className={`mt-4 max-w-xl whitespace-pre-line text-[16px] leading-[1.8] text-muted sm:text-[17px] ${
                      imageLeft ? "" : "lg:ml-auto"
                    }`}
                  >
                    {t(step.descKey)}
                  </p>
                  {/* 단계별 준수/안내 체크리스트 (i18n 배열, t.raw로 받음) */}
                  <ul
                    className={`mt-5 max-w-xl space-y-2.5 ${
                      imageLeft ? "" : "lg:ml-auto"
                    }`}
                  >
                    {(t.raw(step.tipsKey) as string[]).map((tip) => (
                      <li
                        key={tip}
                        className={`flex gap-2.5 text-[15px] leading-[1.7] text-slate-700 sm:text-[15.5px] ${
                          imageLeft ? "" : "lg:flex-row-reverse"
                        }`}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2.4}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                          className="mt-[3px] size-[17px] shrink-0 text-accent-strong"
                        >
                          <path d="M4 12.5l5 5 11-11" />
                        </svg>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </main>
  );
}
