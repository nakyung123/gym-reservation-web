"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import {
  EMPTY_RESERVATION_SNAPSHOT,
  parseReservationSnapshot,
} from "@/lib/reservation-repository";
import { reservationRepository } from "@/lib/reservation-repository-provider";
import { gyms } from "@/lib/mock-data";
import type { Reservation } from "@/types/domain";

const statusLabel: Record<Reservation["status"], string> = {
  reserved: "예약 완료",
  cancelled: "예약 취소",
  used: "이용 완료",
};
const noticeStyles = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-rose-200 bg-rose-50 text-rose-800",
};

function getGymName(gymId: string) {
  return gyms.find((gym) => gym.id === gymId)?.name ?? "알 수 없는 체육관";
}

function createQrCells(seed: string) {
  return Array.from({ length: 49 }, (_, index) => {
    const code = seed.charCodeAt(index % seed.length);
    return (code + index * 7) % 3 !== 0;
  });
}

function QrPreview({ reservation }: { reservation: Reservation }) {
  const cells = createQrCells(reservation.id);

  return (
    <div className="grid size-28 grid-cols-7 gap-1 rounded-lg border border-slate-200 bg-white p-2">
      {cells.map((filled, index) => (
        <span
          key={`${reservation.id}-${index}`}
          className={`rounded-[2px] ${filled ? "bg-slate-950" : "bg-slate-100"}`}
        />
      ))}
    </div>
  );
}

export function ReservationsView() {
  const [actionNotice, setActionNotice] = useState<{
    tone: keyof typeof noticeStyles;
    message: string;
  } | null>(null);
  const reservationSnapshot = useSyncExternalStore(
    reservationRepository.subscribe,
    reservationRepository.getSnapshot,
    () => EMPTY_RESERVATION_SNAPSHOT,
  );
  const reservationReadResult = useMemo(
    () => parseReservationSnapshot(reservationSnapshot),
    [reservationSnapshot],
  );
  const reservations = useMemo(
    () => (reservationReadResult.ok ? reservationReadResult.reservations : []),
    [reservationReadResult],
  );

  const activeReservations = useMemo(
    () =>
      reservations.filter((reservation) => reservation.status === "reserved"),
    [reservations],
  );

  const handleCancel = (reservationId: string) => {
    const result = reservationRepository.cancel(reservationId);

    setActionNotice({
      tone: result.ok ? "success" : "error",
      message: result.message,
    });
  };

  if (!reservationReadResult.ok) {
    return (
      <section className="mx-auto w-full max-w-4xl rounded-lg border border-rose-200 bg-rose-50 p-8 text-center text-rose-800 shadow-sm">
        <p className="text-sm font-semibold">내 예약</p>
        <h1 className="mt-2 text-3xl font-bold">예약 정보를 불러오지 못했습니다</h1>
        <p className="mt-3 text-sm leading-6">{reservationReadResult.message}</p>
      </section>
    );
  }

  if (reservations.length === 0) {
    return (
      <section className="mx-auto w-full max-w-4xl rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold text-sky-700">내 예약</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">
          아직 예약이 없습니다
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          체육관 상세 화면에서 종목, 날짜, 시간을 선택하면 여기에 예약과 QR
          입장권이 표시됩니다.
        </p>
        <Link
          href="/gyms"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-md bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          체육관 찾기
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-sky-700">내 예약</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">
              예약 {activeReservations.length}건
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              현재 브라우저에 저장된 mock 예약입니다. Firebase 연결 전 예약
              흐름 검증용으로 사용합니다.
            </p>
          </div>
          <Link
            href="/gyms"
            className="inline-flex h-10 w-fit items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-sky-400 hover:text-sky-800"
          >
            추가 예약
          </Link>
        </div>

        {actionNotice ? (
          <div
            className={`mt-4 rounded-md border px-4 py-3 text-sm font-semibold ${noticeStyles[actionNotice.tone]}`}
          >
            {actionNotice.message}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4">
        {reservations.map((reservation) => {
          const isCancelled = reservation.status === "cancelled";

          return (
            <article
              key={reservation.id}
              className={`grid gap-5 rounded-lg border bg-white p-5 shadow-sm lg:grid-cols-[1fr_auto] ${
                isCancelled ? "border-slate-200 opacity-70" : "border-slate-200"
              }`}
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-md px-2.5 py-1 text-xs font-bold ${
                      isCancelled
                        ? "bg-slate-100 text-slate-600"
                        : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {statusLabel[reservation.status]}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    예약번호 {reservation.id.slice(0, 8)}
                  </span>
                </div>

                <h2 className="mt-3 text-2xl font-bold text-slate-950">
                  {getGymName(reservation.gymId)}
                </h2>

                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-slate-500">종목</dt>
                    <dd className="mt-1 font-semibold text-slate-950">
                      {reservation.sport}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">이용 일시</dt>
                    <dd className="mt-1 font-semibold text-slate-950">
                      {reservation.date} {reservation.time}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">금액</dt>
                    <dd className="mt-1 font-semibold text-slate-950">
                      {reservation.price.toLocaleString()}원
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">생성일</dt>
                    <dd className="mt-1 font-semibold text-slate-950">
                      {new Date(reservation.createdAt).toLocaleString("ko-KR")}
                    </dd>
                  </div>
                </dl>

                {reservation.status === "reserved" ? (
                  <button
                    type="button"
                    onClick={() => handleCancel(reservation.id)}
                    className="mt-5 h-10 rounded-md border border-rose-200 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
                  >
                    예약 취소
                  </button>
                ) : null}
              </div>

              <div className="flex flex-col items-start gap-3 lg:items-center">
                {reservation.status === "reserved" ? (
                  <>
                    <QrPreview reservation={reservation} />
                    <p className="max-w-36 text-xs leading-5 text-slate-500 lg:text-center">
                      QR은 현재 임시 표시입니다. 이후 실제 QR 생성 로직으로
                      교체합니다.
                    </p>
                  </>
                ) : (
                  <div className="flex size-28 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-3 text-center text-xs font-semibold leading-5 text-slate-500">
                    활성 QR 없음
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
