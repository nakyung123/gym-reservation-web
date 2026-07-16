import type { AdminNavIcon } from "@/components/admin/admin-nav-items";

/**
 * 관리자 사이드바 아이콘 SSOT.
 * admin-nav-items가 이름(키)만 들고 있고, 실제 SVG는 여기서만 그린다.
 * 모두 24 viewBox · stroke 기반이라 currentColor로 활성/비활성 색이 따라온다.
 */
const PATHS: Record<AdminNavIcon, React.ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  gym: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M9 4v16" />
    </>
  ),
  reservation: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 11h18" />
    </>
  ),
  slot: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  customer: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 11a3 3 0 1 0 0-6" />
      <path d="M17.5 20a5.5 5.5 0 0 0-2-4.3" />
    </>
  ),
  inquiry: (
    <>
      <path d="M21 12a8 8 0 1 1-3.2-6.4" />
      <path d="M8 11h8M8 15h5" />
    </>
  ),
  revenue: <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />,
  banner: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 14l4-3 4 3 3-2 7 4" />
    </>
  ),
  audit: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M9 12h7M9 16h5" />
    </>
  ),
  access: (
    <>
      <path d="M12 3a9 9 0 1 0 9 9" />
      <path d="M12 8v4l3 2" />
    </>
  ),
};

export function AdminNavIconSvg({
  name,
  className = "size-[18px]",
}: {
  name: AdminNavIcon;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {PATHS[name]}
    </svg>
  );
}
