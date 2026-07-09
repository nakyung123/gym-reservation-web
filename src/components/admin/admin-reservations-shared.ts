import { reservationStatusLabel } from "@/components/reservation-ticket";
import type { Reservation, ReservationStatus } from "@/types/domain";

/**
 * 관리자 예약 관리 화면의 공용 타입·상수·순수 헬퍼.
 * 컨테이너(admin-reservations-view)와 하위 프레젠테이션 컴포넌트가 공유한다.
 */

/** 예약 상세 조회 상태머신. */
export type DetailState =
  | { status: "idle" }
  | { status: "loading"; reservationId: string }
  | { status: "ready"; reservation: Reservation }
  | { status: "error"; reservationId: string; message: string };

/** 목록 상태 필터(예약 상태 3종 + 전체). */
export type ReservationFilter = ReservationStatus | "all";

/** 예약 목록 조회 상태머신. */
export type ReservationsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; reservations: Reservation[] }
  | { status: "error"; message: string };

/** 성공/오류 알림. */
export type Notice = {
  tone: "success" | "error";
  message: string;
};

/** 진행 중인 행 액션(상태 변경). */
export type ActionState = {
  reservationId: string;
  nextStatus: "used" | "cancelled";
};

// 상태 레이블은 reservation-ticket의 SSOT(reservationStatusLabel)를 그대로 따른다.
// 관리자 필터는 "전체"만 별도 정의.
export const filterLabels: Record<ReservationFilter, string> = {
  all: "전체",
  reserved: reservationStatusLabel.reserved,
  cancelled: reservationStatusLabel.cancelled,
  used: reservationStatusLabel.used,
};

// 관리자 테이블은 사용자 화면(borderless rounded-md)과 달리 의도적으로
// border 있는 pill 스타일을 쓰므로 별도 정의를 유지한다.
// 색 의미는 사용자 화면 SSOT(reservation-ticket의 reservationStatusBadgeStyles)와 맞춘다.
// 예약중=accent 틴트, 취소=error, 사용완료=중립. 단 관리자 테이블은 bordered pill 포맷을 유지한다.
export const statusBadgeStyles: Record<ReservationStatus, string> = {
  reserved: "border-accent/20 bg-accent-tint text-accent-strong",
  cancelled: "border-error/30 bg-error/10 text-error",
  used: "border-line bg-surface-2 text-muted",
};

export const noticeStyles: Record<Notice["tone"], string> = {
  success: "border-success/30 bg-success/10 text-success",
  error: "border-error/30 bg-error/10 text-error",
};

/** ready 상태가 아닐 때 재사용하는 빈 배열(참조 안정성 유지용). */
export const EMPTY_RESERVATIONS: Reservation[] = [];

/** 예약 ID 앞 8자리(테이블 축약 표시용). */
export function getShortId(value: string): string {
  return value.slice(0, 8);
}

/** 예약 목록을 상태별 건수로 집계한다. */
export function countByStatus(
  reservations: Reservation[],
): Record<ReservationStatus, number> {
  const counts: Record<ReservationStatus, number> = {
    reserved: 0,
    cancelled: 0,
    used: 0,
  };
  for (const reservation of reservations) {
    counts[reservation.status] += 1;
  }
  return counts;
}
