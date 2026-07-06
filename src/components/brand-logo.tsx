// 브랜드 로고(워드마크). 제공된 logo.png는 네온 글로우 렌더라 선명하게 추출되지 않아,
// 같은 워드마크 "서울체육예약" + 우상단 ㄱ 마크를 벡터 텍스트로 재현한다.
// 완전히 선명하고 크기 자유(폰트 크기로 스케일). 색은 브랜드 네이비(#2745B3).
// 크기는 className의 text-[..] 로 조절한다(예: text-[24px]). ㄱ 마크는 em 기준으로 함께 커진다.
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex select-none items-start font-extrabold leading-none tracking-[-0.02em] text-[#2745B3] ${className ?? ""}`}
    >
      서울체육예약
      {/* 시안 01: 워드마크 우상단 ㄱ자 포인트(네이비) */}
      <svg
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="ml-[0.08em] mt-[0.06em] h-[0.42em] w-[0.42em]"
      >
        <path d="M3 3h6v6" />
      </svg>
    </span>
  );
}
