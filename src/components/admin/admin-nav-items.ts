/**
 * 관리자 콘솔 메뉴의 SSOT.
 * 좌측 사이드바(admin-shell)와 대시보드(/admin)가 같은 배열을 본다.
 * 메뉴를 추가·변경할 때 이 파일만 고치면 사이드바·대시보드·페이지 제목이 함께 따라온다.
 *
 * 아이콘은 이름(키)만 두고 실제 SVG는 admin-nav-icons.tsx가 그린다(데이터/표현 분리).
 */
export type AdminNavGroup = "운영" | "고객" | "성과" | "기록";

/** admin-nav-icons.tsx가 그릴 수 있는 아이콘 이름. */
export type AdminNavIcon =
  | "dashboard"
  | "gym"
  | "reservation"
  | "slot"
  | "customer"
  | "inquiry"
  | "revenue"
  | "banner"
  | "audit"
  | "access";

export type AdminNavItem = {
  href: string;
  /** 사이드바 라벨 + 페이지 제목 */
  title: string;
  /** 페이지 부제 + 대시보드 바로가기 설명 */
  description: string;
  /** 사이드바 그룹 헤더 */
  group: AdminNavGroup;
  icon: AdminNavIcon;
};

/** 사이드바 그룹 표시 순서. */
export const ADMIN_NAV_GROUPS: AdminNavGroup[] = ["운영", "고객", "성과", "기록"];

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    href: "/admin/gyms",
    title: "시설 관리",
    description: "체육관 데이터를 추가하고 운영 상태와 기본 정보를 수정합니다.",
    group: "운영",
    icon: "gym",
  },
  {
    href: "/admin/reservations",
    title: "예약 관리",
    description: "예약 목록을 조회하고 이용 완료 또는 관리자 취소를 처리합니다.",
    group: "운영",
    icon: "reservation",
  },
  {
    href: "/admin/reservation-slots",
    title: "슬롯 관리",
    description: "날짜와 시간대별 정원, 마감 여부를 조정합니다.",
    group: "운영",
    icon: "slot",
  },
  {
    href: "/admin/customers",
    title: "고객 관리",
    description: "고객의 예약·즐겨찾기 지표를 확인하고 메모를 남깁니다.",
    group: "고객",
    icon: "customer",
  },
  {
    href: "/admin/inquiries",
    title: "문의 관리",
    description: "고객 1:1 문의를 확인하고 답변을 등록·수정합니다.",
    group: "고객",
    icon: "inquiry",
  },
  {
    href: "/admin/revenue",
    title: "정산",
    description:
      "월별·시설별 정산 기초를 확인합니다. 장부상 예약가치(이용 완료) 기준입니다.",
    group: "성과",
    icon: "revenue",
  },
  {
    href: "/admin/banners",
    title: "배너 관리",
    description: "홈에 노출되는 운영 배너를 등록·교체하고 노출 조건을 관리합니다.",
    group: "성과",
    icon: "banner",
  },
  {
    href: "/admin/audit-logs",
    title: "운영 이력",
    description: "관리자 액션 기록을 조회해 운영 변경 내역을 추적합니다.",
    group: "기록",
    icon: "audit",
  },
  {
    href: "/admin/access-logs",
    title: "접속 기록",
    description: "관리자 콘솔 접속 이력(계정·시각·IP·기기)을 확인합니다.",
    group: "기록",
    icon: "access",
  },
];

/** /admin 루트(대시보드). 그룹에 속하지 않고 사이드바 최상단에 단독으로 놓인다. */
export const ADMIN_HOME = {
  href: "/admin",
  title: "대시보드",
  description: "예약·이용·문의 현황을 한눈에 확인합니다.",
  icon: "dashboard",
} as const;

/**
 * pathname으로 현재 메뉴를 찾는다.
 * `/admin/customers/abc` 같은 하위 경로도 상위 메뉴(`/admin/customers`)로 매칭한다.
 * 접두어가 겹치면(예: 향후 중첩 메뉴) 더 긴 href가 더 구체적인 매칭이다.
 */
export function findAdminNavItem(pathname: string): AdminNavItem | null {
  const matches = ADMIN_NAV_ITEMS.filter(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  if (matches.length === 0) return null;
  return matches.reduce((longest, item) =>
    item.href.length > longest.href.length ? item : longest,
  );
}
