import Link from "next/link";

/**
 * 전역 푸터(layout.tsx에 마운트). 시안 v6 .footer 네이비 다단 구성.
 * 컬럼은 flex space-between로 분배하고, px 값(패딩 44/30·제목 15.5·전화 23 등)을 시안대로 옮겼다.
 *
 * 링크/문구는 아래 데이터 배열에서만 관리한다. 항목 추가·삭제·순서 변경은 배열만 수정하면 된다.
 * href가 없는 항목은 아직 페이지가 없는 메뉴로, 시안과 동일한 비주얼이되 이동하지 않는다.
 */
type FooterLink = {
  label: string;
  href?: string;
};

type FooterColumn = {
  title: string;
  links: FooterLink[];
};

const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: "바로가기",
    links: [
      { label: "시설 찾기", href: "/gyms" },
      { label: "예약 조회", href: "/reservations" },
      { label: "이용 안내", href: "/guide" },
      { label: "자주 묻는 질문", href: "/guide" },
    ],
  },
  {
    title: "안내",
    links: [
      // 이용약관·개인정보처리방침은 법적 문서라 데모로 채우지 않고 placeholder로 둔다.
      { label: "이용약관" },
      { label: "개인정보처리방침" },
      { label: "공지사항", href: "/notice" },
    ],
  },
];

function FooterLinkItem({ link }: { link: FooterLink }) {
  // 모바일은 터치 타깃 44px(min-h-[44px]), 데스크톱은 시안 높이로 복귀(sm:min-h-0).
  if (link.href) {
    return (
      <Link
        href={link.href}
        className="inline-flex min-h-[44px] items-center text-slate-400 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 sm:min-h-0"
      >
        {link.label}
      </Link>
    );
  }

  return (
    <span
      className="inline-flex min-h-[44px] cursor-default items-center text-slate-400 sm:min-h-0"
      title="준비 중"
    >
      {link.label}
    </span>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-6 bg-slate-900 text-[14.5px] text-slate-400">
      <div className="mx-auto w-full max-w-[1440px] px-5 pb-[30px] pt-[44px] sm:px-8">
        <div className="flex flex-wrap justify-between gap-[30px]">
          {/* 고객센터 */}
          <div>
            <p className="mb-[9px] text-[15.5px] font-bold text-slate-200">
              고객센터
            </p>
            <p className="text-[23px] font-extrabold tracking-[-0.01em] text-white tabular-nums">
              1599-0000
            </p>
            <p className="mt-1.5 text-[13.5px] text-slate-400">
              평일 09:00–18:00 · 주말·공휴일 휴무
            </p>
          </div>

          {/* 링크 컬럼들 */}
          {FOOTER_COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <p className="mb-[9px] text-[15.5px] font-bold text-slate-200">
                {column.title}
              </p>
              <ul className="grid gap-[7px]">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <FooterLinkItem link={link} />
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          {/* 소개 */}
          <div className="max-w-[280px]">
            <p className="mb-[9px] text-[15.5px] font-bold text-slate-200">
              공공체육관
            </p>
            <p className="text-[13.5px] leading-[1.75] text-slate-400">
              집 근처 공공 체육시설을 쉽고 믿을 수 있게 예약하는 생활체육
              플랫폼입니다.
            </p>
          </div>
        </div>

        <p className="mt-6 border-t border-[#1e293b] pt-[19px] text-[13px] text-[#64748b]">
          ⓒ 2026 공공체육관. 본 화면은 디자인 프리뷰이며 실제 정보가 아닙니다.
        </p>
      </div>
    </footer>
  );
}
