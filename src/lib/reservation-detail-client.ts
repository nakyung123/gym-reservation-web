"use client";

import { getFirebaseClient } from "@/lib/firebase-client";
import { isGym } from "@/lib/gym-utils";
import {
  isUserReservationDetail,
  type UserReservationDetail,
} from "@/lib/reservation-detail";
import { isReservation } from "@/lib/reservation-repository";
import type { Gym, Reservation } from "@/types/domain";

export type FetchUserReservationFailureKind =
  | "not-found"
  | "auth-required"
  | "error";

export type FetchUserReservationResult =
  | {
      ok: true;
      reservation: Reservation;
      detail: UserReservationDetail;
      gym: Gym | null;
    }
  | {
      ok: false;
      kind: FetchUserReservationFailureKind;
      message: string;
      status?: number;
    };

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

async function getIdToken(): Promise<string | null> {
  try {
    const { auth } = getFirebaseClient();
    if (!auth.currentUser) {
      return null;
    }
    return await auth.currentUser.getIdToken();
  } catch {
    return null;
  }
}

export async function fetchUserReservation(
  reservationId: string,
  signal?: AbortSignal,
): Promise<FetchUserReservationResult> {
  const idToken = await getIdToken();
  if (!idToken) {
    return {
      ok: false,
      kind: "auth-required",
      message: "로그인 정보가 없어 예약 상세를 불러올 수 없습니다.",
    };
  }

  let response: Response;
  try {
    response = await fetch(
      `/api/reservations/${encodeURIComponent(reservationId)}`,
      {
        headers: { Authorization: `Bearer ${idToken}` },
        signal,
      },
    );
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return {
      ok: false,
      kind: "error",
      message:
        `예약 상세 요청에 실패했습니다. ${error instanceof Error ? error.message : ""}`.trim(),
    };
  }

  let data: {
    reservation?: unknown;
    detail?: unknown;
    gym?: unknown;
    message?: unknown;
  };
  try {
    data = (await response.json()) as typeof data;
  } catch {
    return {
      ok: false,
      kind: "error",
      message: "예약 상세 응답 형식이 올바르지 않습니다.",
      status: response.status,
    };
  }

  if (
    response.ok &&
    isReservation(data.reservation) &&
    isUserReservationDetail(data.detail) &&
    (data.gym === null || isGym(data.gym))
  ) {
    return {
      ok: true,
      reservation: data.reservation,
      detail: data.detail,
      gym: data.gym,
    };
  }

  if (response.ok) {
    return {
      ok: false,
      kind: "error",
      message: "예약 상세 응답 형식이 올바르지 않습니다.",
      status: response.status,
    };
  }

  if (response.status === 404) {
    return {
      ok: false,
      kind: "not-found",
      message:
        typeof data.message === "string"
          ? data.message
          : "본인 예약이 아니거나 존재하지 않는 예약입니다.",
      status: 404,
    };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      kind: "auth-required",
      message:
        typeof data.message === "string"
          ? data.message
          : "예약 상세를 보려면 로그인 상태가 필요합니다.",
      status: response.status,
    };
  }

  return {
    ok: false,
    kind: "error",
    message:
      typeof data.message === "string"
        ? data.message
        : `예약 상세 조회 실패: status=${response.status}`,
    status: response.status,
  };
}
