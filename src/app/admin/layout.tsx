import type { ReactNode } from "react";
import { AdminAccessPing } from "@/components/admin/admin-access-ping";

// 모든 /admin 경로를 감싸는 레이아웃. 접속 기록 핑을 한 곳에서 마운트해
// 대시보드뿐 아니라 하위 페이지 딥링크 진입도 함께 기록한다.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AdminAccessPing />
      {children}
    </>
  );
}
