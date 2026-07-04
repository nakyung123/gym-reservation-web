import { ReservationReceiptView } from "@/components/reservation-receipt-view";
import { gymRepository } from "@/lib/gym-repository-provider";

type ReservationReceiptPageProps = {
  params: Promise<{
    reservationId: string;
  }>;
};

// 예약 상세 페이지. 별도 풀스크린 오버레이/새 탭이 아니라, 전역 헤더/푸터 안의
// 일반 인페이지로 렌더한다(같은 탭 이동). 제목·설명 헤더와 흰 박스 스택은 클라이언트 뷰가 구성한다.
export default async function ReservationReceiptPage({
  params,
}: ReservationReceiptPageProps) {
  const { reservationId } = await params;
  const gyms = await gymRepository.list();

  return (
    <main className="mx-auto w-full max-w-[1440px] px-5 py-10 text-slate-900 sm:px-8 sm:py-12">
      <ReservationReceiptView gyms={gyms} reservationId={reservationId} />
    </main>
  );
}
