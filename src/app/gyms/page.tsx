import { GymDiscovery } from "@/components/gym-discovery";
import { gyms } from "@/lib/mock-data";

export default function GymsPage() {
  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 lg:px-10">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div>
          <p className="text-sm font-semibold text-sky-700">체육관</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">
            이용할 체육관을 선택하세요
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            이 페이지는 체육관 검색과 종목 필터의 중심 화면이 됩니다. 지금은
            실제 서비스 구조를 잡기 위한 기본 데이터를 보여줍니다.
          </p>
        </div>

        <GymDiscovery gyms={gyms} />
      </section>
    </main>
  );
}
