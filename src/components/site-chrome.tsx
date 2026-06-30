"use client";

import { usePathname } from "next/navigation";

// 전역 chrome(헤더/푸터/플로팅 위젯) 게이트.
// 로그인처럼 자체 헤더를 가진 독립 풀스크린 화면에서는 전역 chrome을 숨긴다.
// 숨김 대상은 정확히 일치하거나 하위 경로(`/login/...`)인 경우 모두 포함한다.
const BARE_PREFIXES = ["/login", "/signup", "/reset-password", "/auth/action"];

function isBareRoute(pathname: string): boolean {
  return BARE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function SiteChrome({
  header,
  footer,
  overlays,
  children,
}: {
  header: React.ReactNode;
  footer: React.ReactNode;
  overlays: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  if (isBareRoute(pathname)) {
    // 독립 풀스크린: 전역 헤더/푸터/위젯 없이 콘텐츠만 채운다.
    return <div className="flex min-h-screen flex-col overflow-x-clip">{children}</div>;
  }

  return (
    <>
      {/* sticky footer 골격: 콘텐츠가 짧아도 푸터가 화면 바닥에 붙도록
          전체를 min-h-screen flex-col로 감싼다. overflow-x-clip은 full-bleed(w-screen)
          요소가 세로 스크롤바 너비만큼 가로 넘침을 만들어 가로 스크롤이 생기는 걸 막는다
          (clip이라 sticky 헤더에는 영향 없음). */}
      <div className="flex min-h-screen flex-col overflow-x-clip">
        {header}
        <div className="flex flex-1 flex-col">{children}</div>
        {footer}
      </div>
      {overlays}
    </>
  );
}
