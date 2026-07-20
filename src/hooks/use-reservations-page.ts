"use client";

import { useEffect, useState } from "react";
import { reservationRepository } from "@/lib/reservation-repository-provider";
import { RESERVATION_PAGE_SIZE } from "@/lib/reservation-repository";
import type { Reservation } from "@/types/domain";

type PageState =
  | { status: "loading" }
  | { status: "ready"; page: number; reservations: Reservation[]; total: number }
  | { status: "error"; page: number; message: string };

export type ReservationsPage = {
  /** 현재 페이지의 예약(최신순). 조회 전이면 빈 배열. */
  reservations: Reservation[];
  /** 전체 페이지 수(하한 1). */
  totalPages: number;
  /** 조회 실패 메시지. 없으면 null. */
  loadError: string | null;
  /** 첫 응답이 아직 도착하지 않은 상태. */
  pending: boolean;
};

/**
 * 마이페이지 예약 목록을 페이지 단위로 조회하는 훅.
 *
 * 예전에는 목록 화면이 사용자의 전 기간 예약을 한 번에 받아(누적 2,000건이면 약 515KB)
 * 클라이언트에서 잘라 썼다. 지금은 서버가 페이지를 잘라 주므로 응답 크기가
 * RESERVATION_PAGE_SIZE로 고정된다.
 *
 * 페이지가 바뀔 때만 재조회하고, 응답이 도착했을 때 페이지가 이미 바뀌었으면 버린다.
 */
export function useReservationsPage(page: number): ReservationsPage {
  const [state, setState] = useState<PageState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    void reservationRepository
      .fetchPage(page, controller.signal)
      .then((result) => {
        if (!active) return;
        if (result.ok) {
          setState({
            status: "ready",
            page,
            reservations: result.reservations,
            total: result.total,
          });
          return;
        }
        // 인증 준비 중은 오류가 아니다. 마이페이지가 별도 게이트로 처리한다.
        if (result.reason === "auth-required" || result.reason === "not-ready") {
          setState({ status: "ready", page, reservations: [], total: 0 });
          return;
        }
        setState({ status: "error", page, message: result.message });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [page]);

  const settled = state.status !== "loading" && state.page === page;

  return {
    reservations:
      state.status === "ready" && state.page === page ? state.reservations : [],
    totalPages:
      state.status === "ready" && state.page === page
        ? Math.max(1, Math.ceil(state.total / RESERVATION_PAGE_SIZE))
        : 1,
    loadError:
      state.status === "error" && state.page === page ? state.message : null,
    pending: !settled,
  };
}
