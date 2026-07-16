import type { ReactNode } from "react";
import { AdminAccessPing } from "@/components/admin/admin-access-ping";
import { AdminAuthGate } from "@/components/admin/admin-auth-gate";
import { AdminShell } from "@/components/admin/admin-shell";

// 모든 /admin 경로를 감싸는 레이아웃.
//  - AdminAuthGate: Basic Auth(proxy.ts) 다음 단계인 Firebase 로그인 + admin 클레임 게이트.
//    통과하지 못하면 로그인 폼/권한 안내만 보여주고 본문·사이드바를 렌더하지 않는다.
//  - AdminAccessPing: 게이트 안쪽에 두어 실제 관리자로 진입했을 때만 접속을 기록한다.
//    (하위 페이지 딥링크 진입도 layout이 매번 마운트하므로 함께 기록된다.)
//  - AdminShell: 컨테이너/breadcrumb/제목/사이드바를 제공하므로 각 page는 본문만 렌더한다.
export default function AdminLayout({ children }: { children: ReactNode }) {
  // admin-console: 고객 화면 네이비와 분리된 퍼플(#5F43FF) 팔레트 스코프.
  // 이 클래스 안에서만 --accent 등 토큰이 admin 색으로 덮어써진다(globals.css).
  return (
    <div className="admin-console">
      <AdminAuthGate>
        <AdminAccessPing />
        <AdminShell>{children}</AdminShell>
      </AdminAuthGate>
    </div>
  );
}
