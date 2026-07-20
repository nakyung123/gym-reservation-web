"use client";

import { useEffect, useState } from "react";
import { reservationRepository } from "@/lib/reservation-repository-provider";
import type { Reservation, Sport } from "@/types/domain";

type ActiveState =
  | { status: "idle" }
  | { status: "ready"; key: string; reservations: Reservation[] }
  | { status: "error"; key: string; message: string };

export type ActiveReservations = {
  /** 해당 (체육관·종목·날짜)의 활성 예약. 조회 전이면 빈 배열. */
  reservations: Reservation[];
  /** 조회 실패 메시지. 없으면 null. 조용히 삼키지 않고 호출부가 표시할 수 있게 한다. */
  loadError: string | null;
  /**
   * 조회가 필요한데 아직 결과·오류가 없는 상태.
   *
   * 판정 근거가 아직 없다는 뜻이라, 이때 시간 선택을 열어두면 중복 예약을
   * 걸러내지 못한 화면을 보여주게 된다. 호출부는 "차단"이 아니라 "대기"로 표시한다.
   */
  pending: boolean;
};

/**
 * 예약 폼의 중복 판정에 쓰는 활성 예약을 조회하는 훅.
 *
 * 예약 목록 스냅샷(사용자의 전 기간 예약)을 구독하지 않는 이유는 크기 때문이다.
 * 판정에 필요한 건 (체육관·종목·날짜)가 일치하는 활성 예약뿐이고, 그건 해당
 * 슬롯 묶음(시간대 수)으로 상한이 잡힌다. 전체 목록을 받으면 사용자의 누적
 * 예약에 비례해 비용이 커진다.
 *
 * 요청 키가 바뀔 때만 재조회하고, 응답이 도착했을 때 키가 이미 바뀌었으면 버린다
 * (다른 날짜/종목으로 이동한 경우).
 *
 * @param enabled 선행 조건(인증·종목/날짜 선택)이 충족됐는지.
 */
export function useActiveReservations({
  gymId,
  sport,
  date,
  enabled,
}: {
  gymId: string;
  sport: Sport | null;
  date: string;
  enabled: boolean;
}): ActiveReservations {
  const [state, setState] = useState<ActiveState>({ status: "idle" });

  const key = enabled && sport && date ? `${gymId}|${sport}|${date}` : null;

  useEffect(() => {
    // 선행 조건 미충족이면 조회하지 않는다. 이전 결과를 setState로 지울 필요는 없다 —
    // 반환값이 현재 key와 일치할 때만 값을 노출하므로 자연히 무시된다.
    if (!key || !sport || !date) {
      return;
    }

    const controller = new AbortController();
    let active = true;

    void reservationRepository
      .fetchActiveInScope({ gymId, sport, date }, controller.signal)
      .then((result) => {
        if (!active) return;
        if (result.ok) {
          setState({ status: "ready", key, reservations: result.reservations });
          return;
        }
        // 인증 전 상태는 폼이 별도로 안내하므로 오류로 띄우지 않는다.
        if (result.reason === "auth-required" || result.reason === "not-ready") {
          setState({ status: "ready", key, reservations: [] });
          return;
        }
        setState({ status: "error", key, message: result.message });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [key, gymId, sport, date]);

  const settledForKey =
    key !== null && state.status !== "idle" && state.key === key;

  return {
    reservations:
      state.status === "ready" && state.key === key ? state.reservations : [],
    loadError:
      state.status === "error" && state.key === key ? state.message : null,
    // 조회가 필요한(key가 있는) 상태에서 아직 이번 key의 결과가 안 온 동안이 대기다.
    pending: key !== null && !settledForKey,
  };
}
