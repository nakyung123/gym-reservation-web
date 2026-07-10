"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { pingAdminAccess } from "@/lib/admin/admin-access-log-client";

// 브라우저 세션당 1회만 접속을 기록하기 위한 sessionStorage 플래그.
// SPA 리마운트·admin 내부 라우팅으로 인한 중복 기록을 막는다.
// 재로그인(새 탭/새 세션)은 새 기록으로 남는다.
const SESSION_FLAG = "admin-access-pinged";

// 모든 /admin 경로에 마운트되는 비가시 컴포넌트.
// 관리자가 콘솔에 진입하면 접속을 서버에 1회 기록한다.
export function AdminAccessPing() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 세션당 1회 dedupe. sessionStorage 접근이 막혀 있으면(프라이버시 모드 등)
    // 플래그 없이 그대로 진행한다.
    try {
      if (window.sessionStorage.getItem(SESSION_FLAG)) return;
      window.sessionStorage.setItem(SESSION_FLAG, "1");
    } catch {
      // dedupe 불가 — 아래 기록은 그대로 시도한다.
    }

    void pingAdminAccess(pathname ?? "/admin");
  }, [pathname]);

  return null;
}
