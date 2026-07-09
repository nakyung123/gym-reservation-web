"use client";

import { useEffect, useState } from "react";
import { fetchReservationSlots } from "@/lib/reservation-slot-availability";
import type { ReservationSlotAvailability, Sport } from "@/types/domain";

type SlotsState =
  | { status: "idle" }
  | {
      status: "ready";
      key: string;
      slots: Map<string, ReservationSlotAvailability>;
    }
  | { status: "error"; key: string; message: string };

export type ReservationSlots = {
  /** 시간→슬롯 가용성 맵. 아직 조회 전/조회 중이면 null. */
  slotsLookup: Map<string, ReservationSlotAvailability> | null;
  /** 슬롯 조회 실패 메시지. 없으면 null. */
  slotsFetchError: string | null;
  /** 조회 요청이 떠 있으나 아직 결과·오류가 없는 대기 상태. */
  slotsFetchPending: boolean;
};

/**
 * 선택한 (체육관·종목·날짜)에 대한 실시간 예약 슬롯 가용성을 조회하는 훅.
 *
 * 예약 폼 본체에 섞여 있던 slotsState + fetch effect + 파생값(lookup/error/pending)
 * 계산을 분리한다. 요청 키가 바뀔 때만 재조회하며, 응답이 도착했을 때 키가 이미
 * 바뀌었으면(다른 날짜/종목으로 이동) 그 응답은 무시한다.
 *
 * @param enabled 조회 선행 조건(날짜 준비·인증·종목/날짜 선택)이 모두 충족됐는지.
 * @param formatFetchError 네트워크 예외 메시지를 화면 문구로 변환(i18n은 호출부 책임).
 */
export function useReservationSlots({
  gymId,
  sport,
  date,
  enabled,
  formatFetchError,
}: {
  gymId: string;
  sport: Sport | null;
  date: string;
  enabled: boolean;
  formatFetchError: (detail: string) => string;
}): ReservationSlots {
  const [slotsState, setSlotsState] = useState<SlotsState>({ status: "idle" });

  // 조회 대상 식별 키. 선행 조건 미충족이면 null(조회 안 함).
  const slotsRequestKey =
    enabled && sport ? [gymId, sport, date].join("__") : null;

  useEffect(() => {
    if (!slotsRequestKey || !sport) return;
    const controller = new AbortController();

    fetchReservationSlots({ gymId, sport, date, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.ok) {
          setSlotsState({
            status: "ready",
            key: slotsRequestKey,
            slots: new Map(result.slots.map((slot) => [slot.time, slot])),
          });
        } else {
          setSlotsState({
            status: "error",
            key: slotsRequestKey,
            message: result.message,
          });
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        const detail = error instanceof Error ? error.message : "";
        setSlotsState({
          status: "error",
          key: slotsRequestKey,
          message: formatFetchError(detail),
        });
      });

    return () => controller.abort();
    // formatFetchError는 매 렌더 새 클로저라 deps에서 제외한다(넣으면 매 렌더 재조회).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gymId, sport, date, slotsRequestKey]);

  // 응답 키가 현재 요청 키와 같을 때만 유효한 결과로 인정한다(경쟁 응답 차단).
  const slotsLookup =
    slotsState.status === "ready" && slotsState.key === slotsRequestKey
      ? slotsState.slots
      : null;
  const slotsFetchError =
    slotsState.status === "error" && slotsState.key === slotsRequestKey
      ? slotsState.message
      : null;
  const slotsFetchPending =
    Boolean(slotsRequestKey) && !slotsLookup && !slotsFetchError;

  return { slotsLookup, slotsFetchError, slotsFetchPending };
}
