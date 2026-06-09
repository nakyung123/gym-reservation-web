import Link from "next/link";
import { AdminOverviewPanel } from "@/components/admin/admin-overview-panel";

const adminLinks = [
  {
    href: "/admin/gyms",
    title: "시설 관리",
    description: "체육관 데이터를 추가하고 운영 상태와 기본 정보를 수정합니다.",
    meta: "시설 CRUD",
  },
  {
    href: "/admin/reservations",
    title: "예약 관리",
    description: "예약 목록을 조회하고 이용 완료 또는 관리자 취소를 처리합니다.",
    meta: "예약 상태 처리",
  },
  {
    href: "/admin/reservation-slots",
    title: "슬롯 관리",
    description: "날짜와 시간대별 정원, 마감 여부를 조정합니다.",
    meta: "정원 및 마감 관리",
  },
];

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 lg:px-10">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header>
          <p className="text-sm font-semibold text-accent-strong">관리자</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">
            운영 관리
          </h1>
        </header>

        <AdminOverviewPanel />

        <div className="grid gap-4 sm:grid-cols-2">
          {adminLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg border border-line bg-white p-5 shadow-sm transition hover:border-accent hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              <span className="inline-flex h-6 items-center rounded-full border border-line bg-slate-50 px-2 text-xs font-semibold text-slate-600">
                {item.meta}
              </span>
              <h2 className="mt-4 text-xl font-bold text-slate-950">
                {item.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {item.description}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
