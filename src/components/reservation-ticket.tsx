"use client";

import { getReservationEntryCode } from "@/lib/reservation-detail";
import type { Gym, Reservation } from "@/types/domain";

export const reservationStatusLabel: Record<Reservation["status"], string> = {
  reserved: "예약 완료",
  cancelled: "예약 취소",
  used: "이용 완료",
};

export const reservationStatusBadgeStyles: Record<
  Reservation["status"],
  string
> = {
  reserved: "bg-accent-tint text-accent-strong",
  cancelled: "bg-error/10 text-error",
  used: "bg-surface-2 text-muted",
};

function createQrCells(seed: string) {
  return Array.from({ length: 49 }, (_, index) => {
    const code = seed.charCodeAt(index % seed.length);
    return (code + index * 7) % 3 !== 0;
  });
}

function QrPreview({ reservation }: { reservation: Reservation }) {
  const cells = createQrCells(reservation.id);

  return (
    <div
      className="grid size-32 grid-cols-7 gap-1 rounded-lg border border-line bg-white p-2"
      aria-label="모바일 입장권 QR 코드"
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
  // 서버 detail.admission.entryCode가 전달되면 그 값을 우선 사용한다.
  // 비어 있으면 기존 폴백(getReservationEntryCode)으로 표시한다.
  const entryCode =
    entryCodeProp && entryCodeProp.length > 0
      ? entryCodeProp
      : getReservationEntryCode(reservation);

  return (
    <div className="flex flex-col items-start gap-3 lg:items-center">
      <div className="flex w-full items-center justify-between gap-3 lg:w-40">
        <p className="text-sm font-bold text-slate-950">모바일 입장권</p>
        <span
          className="rounded-md bg-success/10 px-2 py-1 text-xs font-bold text-success"
          aria-label="입장권 상태: 활성"
        >
          활성
        </span>
      </div>
      <QrPreview reservation={reservation} />
      <div className="w-full rounded-md bg-surface-2 px-3 py-2 text-left lg:w-40 lg:text-center">
        <p className="text-xs font-semibold text-slate-500">현장 확인 코드</p>
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
  const isUsed = status === "used";

  return (
    <div
      className={`flex size-32 items-center justify-center rounded-lg border p-3 text-center text-xs font-semibold leading-5 ${
        isUsed
          ? "border-line bg-surface-2 text-muted"
          : "border-line bg-surface-2 text-subtle"
      }`}
      aria-label={isUsed ? "입장권 이용 완료됨" : "입장권 비활성화됨"}
    >
      {isUsed ? (
        <>
          이용
          <br />
          완료
        </>
      ) : (
        <>
          입장권
          <br />
          비활성화
        </>
      )}
    </div>
  );
}

export function ReservationUnavailableTicket() {
  return (
    <div
      className="flex size-32 items-center justify-center rounded-lg border border-warning/30 bg-warning/10 p-3 text-center text-xs font-semibold leading-5 text-warning"
      aria-label="입장권 시설 정보 확인 필요"
    >
      시설 정보
      <br />
      확인 필요
    </div>
  );
}

export function getReservationGymSummary(
  gymsById: Map<string, Gym>,
  reservation: Reservation,
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
    name: "현재 시설 목록에서 제외된 체육관",
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
