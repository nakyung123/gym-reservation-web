import { ReservationReceiptView } from "@/components/reservation-receipt-view";
import { gymRepository } from "@/lib/gym-repository-provider";

type ReservationReceiptPageProps = {
  params: Promise<{
    reservationId: string;
  }>;
};

// "자세히 보기" 새 탭 전용 페이지. KMI 예약 내역 양식을 우리 데이터로 렌더한다.
// 회색 배경 위 1200px 중앙 정렬 레이아웃은 클라이언트 뷰에서 구성한다.
export default async function ReservationReceiptPage({
  params,
}: ReservationReceiptPageProps) {
  const { reservationId } = await params;
  const gyms = await gymRepository.list();

  // KMI 예약 내역처럼 독립 화면으로 보이도록, 전역 헤더/푸터/챗 위젯(z-50) 위를
  // 덮는 풀스크린 오버레이로 렌더한다. 새 탭 전용이라 사이트 내비는 노출하지 않는다.
  return (
    <main className="fixed inset-0 z-[60] overflow-y-auto bg-slate-100 px-5 py-10 text-slate-900">
      <ReservationReceiptView gyms={gyms} reservationId={reservationId} />
    </main>
  );
}
