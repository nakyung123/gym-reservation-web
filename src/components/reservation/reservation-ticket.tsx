import type { Gym, Reservation } from "@/types/domain";

// 예약 상태 라벨(국문). 사용자 화면(/gyms·/reserve·/reservations·/mypage)은
// messages의 Reservation.status.* 를 useTranslations로 사용하고, 이 상수는
// 다국어 범위에 포함되지 않는 관리자(admin) 화면 전용 국문 SSOT로만 쓴다.
export const reservationStatusLabel: Record<Reservation["status"], string> = {
  reserved: "예약 완료",
  cancelled: "예약 취소",
  used: "이용 완료",
};

// 예약번호 표시값 = 예약일(YYMMDD) + 예약 id 파생 4자리(표시용 안정값).
// 마이페이지 예약 목록과 예약 상세가 공유하는 SSOT. 예: 2026-06-23 → 2606231234
export function reservationDisplayNumber(reservation: Reservation): string {
  const ymd = reservation.date.slice(2).replaceAll("-", "");
  let hash = 0;
  for (const ch of reservation.id) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return `${ymd}${String(hash % 10000).padStart(4, "0")}`;
}

// 예약 상태 배지 색상 SSOT(사용자/관리자 공통).
export const reservationStatusBadgeStyles: Record<
  Reservation["status"],
  string
> = {
  reserved: "bg-accent-tint text-accent-strong",
  cancelled: "bg-error/10 text-error",
  used: "bg-surface-2 text-muted",
};

// 현재 시설 목록에 없는 예약의 표시용 이름은 호출 측에서 번역해 넘긴다
// (Reservation.missingGymName). 함수 자체는 화면 문구를 보유하지 않는다.
export function getReservationGymSummary(
  gymsById: Map<string, Gym>,
  reservation: Reservation,
  missingGymName: string,
) {
  const gym = gymsById.get(reservation.gymId);

  if (gym) {
    return {
      gym,
      name: gym.name,
      isMissingFromCurrentData: false,
    };
  }

  return {
    gym: null,
    name: missingGymName,
    isMissingFromCurrentData: true,
  };
}

