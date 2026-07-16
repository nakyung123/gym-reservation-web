import { AdminDashboard } from "@/components/admin/admin-dashboard";

// 관리자 대시보드. 셸(사이드바·상단바·제목)은 AdminShell(layout)이 제공하므로 본문만 렌더한다.
// 메뉴 바로가기는 사이드바가 상시 제공하므로, 이 화면은 지표에만 집중한다.
export default function AdminPage() {
  return <AdminDashboard />;
}
