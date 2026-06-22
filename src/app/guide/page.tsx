import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

// 이용 방법 = "현장에서 이렇게 이용합니다"를 보여주는 4단계 안내.
//   KMI 'KMI 특별함'(INTDS/SPECIAL)의 01~04 교차 블록을 실측해 그대로 옮긴다:
//   이미지 박스 3:2(599×419)·radius 20, 좌우 ~50/50, 01 이미지 좌측 시작으로 블록마다 교차,
//   번호 라벨(18/700·accent) + 굵은 제목 + 설명. 색만 우리 네이비 토큰.
// 사진 에셋이 없어 이미지 자리는 단계별 듀오톤 일러스트로 채운다(사용자 결정 A).
//   듀오톤 팔레트 = 확정 아이콘 스펙: base #BCC8F2 / accent #2745B3 / deep #1E3A8A.
// 단계 내용은 STEPS 배열 + Guide 네임스페이스(i18n)에서 관리한다. (구조 유연성 우선)

export const metadata: Metadata = {
  title: "이용 방법 — 공공체육관 예약",
  description: "예약 QR 준비부터 현장 인식·입장·완료까지, 현장 이용 방법을 단계별로 안내합니다.",
};

const IC_BASE = "#BCC8F2";
const IC_ACCENT = "#2745B3";
const IC_DEEP = "#1E3A8A";

// QR 글리프(가이드 1·2단계 공용) — 모서리 finder + 흩뿌린 모듈.
function Qr({ x, y, s, color }: { x: number; y: number; s: number; color: string }) {
  const u = s / 7;
  const finder = (fx: number, fy: number) => (
    <>
      <rect x={fx} y={fy} width={u * 2.2} height={u * 2.2} rx={1} fill={color} />
      <rect x={fx + u * 0.6} y={fy + u * 0.6} width={u} height={u} fill="#fff" />
    </>
  );
  const mod = (mx: number, my: number) => (
    <rect x={x + u * mx} y={y + u * my} width={u} height={u} fill={color} />
  );
  return (
    <g>
      {finder(x, y)}
      {finder(x + s - u * 2.2, y)}
      {finder(x, y + s - u * 2.2)}
      {mod(3.3, 0.3)}
      {mod(4.5, 1.5)}
      {mod(3.3, 2.6)}
      {mod(0.3, 4.4)}
      {mod(4.4, 4.4)}
      {mod(5.6, 3.2)}
      {mod(5.6, 5.6)}
      {mod(3.2, 5.4)}
    </g>
  );
}

// 1) 예약 QR 준비 — 휴대폰 화면의 예약 QR.
function ArtQrReady() {
  return (
    <svg viewBox="0 0 240 180" fill="none" role="img" aria-label="휴대폰에서 예약 QR을 준비하는 일러스트" className="w-full max-w-[260px]">
      <ellipse cx="120" cy="96" rx="106" ry="78" fill="#EEF1FB" />
      <rect x="86" y="24" width="68" height="130" rx="14" fill="#fff" stroke={IC_BASE} strokeWidth="2.5" />
      <rect x="108" y="32" width="24" height="4" rx="2" fill={IC_BASE} />
      <rect x="96" y="44" width="48" height="90" rx="5" fill="#EEF1FB" />
      <Qr x={102} y={54} s={36} color={IC_ACCENT} />
      <rect x="104" y="122" width="32" height="4" rx="2" fill={IC_BASE} />
      <circle cx="150" cy="40" r="13" fill={IC_DEEP} />
      <path d="M145 40l3.4 3.4 6-6.4" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

// 2) 현장 QR 인식 — 스캔 프레임 안의 QR + 인식 빔.
function ArtScan() {
  const bracket = (d: string) => (
    <path d={d} stroke={IC_ACCENT} strokeWidth="4" strokeLinecap="round" fill="none" />
  );
  return (
    <svg viewBox="0 0 240 180" fill="none" role="img" aria-label="입구 단말기에 QR을 인식시키는 일러스트" className="w-full max-w-[260px]">
      <ellipse cx="120" cy="96" rx="106" ry="78" fill="#EEF1FB" />
      <rect x="74" y="48" width="92" height="92" rx="14" fill="#fff" stroke={IC_BASE} strokeWidth="2.5" />
      <Qr x={92} y={66} s={56} color={IC_ACCENT} />
      {/* 스캔 프레임 */}
      {bracket("M86 70v-8h8")}
      {bracket("M154 70v-8h-8")}
      {bracket("M86 118v8h8")}
      {bracket("M154 118v8h-8")}
      {/* 인식 빔 */}
      <line x1="86" y1="94" x2="154" y2="94" stroke={IC_ACCENT} strokeWidth="2.5" opacity="0.5" />
      {/* 인식 완료 배지 */}
      <circle cx="160" cy="56" r="15" fill={IC_DEEP} />
      <path d="M154 56l4 4 7-7.6" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

// 3) 입장·이용 — 열린 게이트 + 입장 화살표 + 코트.
function ArtEnter() {
  return (
    <svg viewBox="0 0 240 180" fill="none" role="img" aria-label="확인 후 입장해 코트를 이용하는 일러스트" className="w-full max-w-[260px]">
      <ellipse cx="120" cy="96" rx="106" ry="78" fill="#EEF1FB" />
      {/* 코트(뒤) */}
      <rect x="120" y="78" width="86" height="58" rx="8" fill="#fff" stroke={IC_BASE} strokeWidth="2.2" />
      <g stroke={IC_BASE} strokeWidth="2">
        <line x1="163" y1="78" x2="163" y2="136" />
        <circle cx="163" cy="107" r="9" fill="none" />
      </g>
      {/* 게이트(아치) */}
      <path d="M44 140V74a26 26 0 0 1 52 0v66" stroke={IC_ACCENT} strokeWidth="5" strokeLinecap="round" fill="none" />
      <rect x="38" y="138" width="64" height="6" rx="3" fill={IC_DEEP} />
      {/* 입장 화살표 */}
      <g stroke={IC_DEEP} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <line x1="60" y1="108" x2="92" y2="108" />
        <path d="M82 98l12 10-12 10" />
      </g>
    </svg>
  );
}

// 4) 이용 완료 — 큰 체크 배지.
function ArtDone() {
  return (
    <svg viewBox="0 0 240 180" fill="none" role="img" aria-label="이용을 완료하고 체크아웃하는 일러스트" className="w-full max-w-[260px]">
      <ellipse cx="120" cy="96" rx="106" ry="78" fill="#EEF1FB" />
      <circle cx="120" cy="92" r="46" fill="#fff" stroke={IC_BASE} strokeWidth="2.5" />
      <circle cx="120" cy="92" r="34" fill={IC_ACCENT} />
      <path d="M105 92l10 10 20-21" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* 반짝임 */}
      <g fill={IC_DEEP}>
        <path d="M176 52l2.4 5.6 5.6 2.4-5.6 2.4-2.4 5.6-2.4-5.6-5.6-2.4 5.6-2.4z" />
        <circle cx="64" cy="60" r="4" fill={IC_BASE} />
        <circle cx="70" cy="132" r="5" fill={IC_BASE} />
      </g>
    </svg>
  );
}

type GuideStep = { titleKey: string; descKey: string; art: ReactNode };

// 현장 순서: 예약 QR 준비 → 현장 QR 인식 → 입장·이용 → 이용 완료
const STEPS: GuideStep[] = [
  { titleKey: "step1Title", descKey: "step1Desc", art: <ArtQrReady /> },
  { titleKey: "step2Title", descKey: "step2Desc", art: <ArtScan /> },
  { titleKey: "step3Title", descKey: "step3Desc", art: <ArtEnter /> },
  { titleKey: "step4Title", descKey: "step4Desc", art: <ArtDone /> },
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
                  <div className="flex aspect-[3/2] items-center justify-center overflow-hidden rounded-[20px] bg-accent-tint/55 px-6">
                    {step.art}
                  </div>
                </div>
                <div className={imageLeft ? "lg:order-2" : "lg:order-1"}>
                  <span className="text-[18px] font-bold tracking-[0.06em] text-accent-strong tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h2 className="mt-2 text-[26px] font-extrabold leading-[1.3] tracking-[-0.02em] text-slate-950 sm:text-[30px]">
                    {t(step.titleKey)}
                  </h2>
                  <p className="mt-4 max-w-md text-[16px] leading-[1.8] text-muted sm:text-[17px]">
                    {t(step.descKey)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        {/* 하단 액션 */}
        <div className="mt-16 flex flex-wrap items-center gap-3 sm:mt-20">
          <Link
            href="/gyms"
            className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-5 text-[15px] font-bold text-accent-ink transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            시설 찾기
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="size-[18px]"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
          <Link
            href="/faq"
            className="inline-flex h-11 items-center rounded-md border border-line-strong px-5 text-[15px] font-bold text-foreground transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            문의·FAQ 보기
          </Link>
        </div>
      </div>
    </main>
  );
}
