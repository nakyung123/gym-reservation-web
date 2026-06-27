"use client";

import { useTranslations } from "next-intl";
import { getReservationEntryCode } from "@/lib/reservation-detail";
import type { Gym, Reservation } from "@/types/domain";

// 예약 상태 라벨(국문). 사용자 화면(/gyms·/reserve·/reservations·/mypage)은
// messages의 Reservation.status.* 를 useTranslations로 사용하고, 이 상수는
// 다국어 범위에 포함되지 않는 관리자(admin) 화면 전용 국문 SSOT로만 쓴다.
export const reservationStatusLabel: Record<Reservation["status"], string> = {
  reserved: "예약 완료",
  cancelled: "예약 취소",
  used: "이용 완료",
};

// 예약 상태 배지 색상 SSOT(사용자/관리자 공통).
export const reservationStatusBadgeStyles: Record<
  Reservation["status"],
  string
> = {
  reserved: "bg-accent-tint text-accent-strong",
  cancelled: "bg-error/10 text-error",
  used: "bg-surface-2 text-muted",
};

// QR 표시용 셀(7×7=49칸) 패턴 생성. 실제 스캔용이 아니라 예약 id 시드 기반의
// 안정적 표시용 패턴이다. QR 미리보기·QR 체크인 팝업이 공유한다.
export function createQrCells(seed: string) {
  return Array.from({ length: 49 }, (_, index) => {
    const code = seed.charCodeAt(index % seed.length);
    return (code + index * 7) % 3 !== 0;
  });
}

function QrPreview({ reservation }: { reservation: Reservation }) {
  const t = useTranslations("Reservation");
  const cells = createQrCells(reservation.id);

  return (
    <div
      className="grid size-32 grid-cols-7 gap-1 rounded-lg border border-line bg-white p-2"
      aria-label={t("ticketQrAria")}
      role="img"
    >
      {cells.map((filled, index) => (
        <span
          key={`${reservation.id}-${index}`}
          className={`rounded-[2px] ${filled ? "bg-slate-950" : "bg-slate-100"}`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

export function ReservationAdmissionTicket({
  reservation,
  entryCode: entryCodeProp,
}: {
  reservation: Reservation;
  entryCode?: string | null;
}) {
  const t = useTranslations("Reservation");
  // 서버 detail.admission.entryCode가 전달되면 그 값을 우선 사용한다.
  // 비어 있으면 기존 폴백(getReservationEntryCode)으로 표시한다.
  const entryCode =
    entryCodeProp && entryCodeProp.length > 0
      ? entryCodeProp
      : getReservationEntryCode(reservation);

  return (
    <div className="flex flex-col items-start gap-3 lg:items-center">
      <div className="flex w-full items-center justify-between gap-3 lg:w-40">
        <p className="text-sm font-bold text-slate-950">{t("ticketMobile")}</p>
        <span
          className="rounded-md bg-success/10 px-2 py-1 text-xs font-bold text-success"
          aria-label={t("ticketActiveAria")}
        >
          {t("ticketActive")}
        </span>
      </div>
      <QrPreview reservation={reservation} />
      <div className="w-full rounded-md bg-surface-2 px-3 py-2 text-left lg:w-40 lg:text-center">
        <p className="text-xs font-semibold text-slate-500">
          {t("ticketEntryCode")}
        </p>
        <p className="mt-1 font-mono text-sm font-bold tracking-wider text-slate-950">
          {entryCode}
        </p>
      </div>
    </div>
  );
}

export function ReservationInactiveTicket({
  status,
}: {
  status: Exclude<Reservation["status"], "reserved">;
}) {
  const t = useTranslations("Reservation");
  const isUsed = status === "used";

  return (
    <div
      className={`flex size-32 items-center justify-center rounded-lg border p-3 text-center text-xs font-semibold leading-5 ${
        isUsed
          ? "border-line bg-surface-2 text-muted"
          : "border-line bg-surface-2 text-subtle"
      }`}
      aria-label={isUsed ? t("ticketUsedAria") : t("ticketInactiveAria")}
    >
      {isUsed ? t("ticketUsed") : t("ticketInactive")}
    </div>
  );
}

export function ReservationUnavailableTicket() {
  const t = useTranslations("Reservation");
  return (
    <div
      className="flex size-32 items-center justify-center rounded-lg border border-warning/30 bg-warning/10 p-3 text-center text-xs font-semibold leading-5 text-warning"
      aria-label={t("ticketUnavailableAria")}
    >
      {t("ticketUnavailable")}
    </div>
  );
}

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

export function formatReservationCreatedAt(createdAt: string) {
  return new Date(createdAt).toLocaleString("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function formatCancellationDeadline(deadline: Date) {
  return deadline.toLocaleString("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}
