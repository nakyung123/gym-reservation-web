"use client";

import { getFirebaseClient } from "@/lib/firebase-client";
import { isGym } from "@/lib/gym-utils";
import {
  isUserReservationDetail,
  type UserReservationDetail,
} from "@/lib/reservation-detail";
import { isReservation } from "@/lib/reservation-repository";
import type { Gym, Reservation } from "@/types/domain";

import { isAbortError } from "@/lib/async-error";
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

type IdTokenResult =
  | { ok: true; idToken: string }
  | { ok: false; kind: "auth-required" | "error"; message: string };


async function getIdToken(): Promise<IdTokenResult> {
  try {
    const { auth } = getFirebaseClient();
    if (!auth.currentUser) {
      return {
        ok: false,
        kind: "auth-required",
        message: "로그인 정보가 없어 예약 상세를 불러올 수 없습니다.",
      };
    }
    return { ok: true, idToken: await auth.currentUser.getIdToken() };
  } catch {
    return {
      ok: false,
      kind: "error",
      message: "로그인 인증 정보를 확인하지 못했습니다. 다시 로그인해 주세요.",
    };
  }
}

export async function fetchUserReservation(
  reservationId: string,
  signal?: AbortSignal,
): Promise<FetchUserReservationResult> {
  const token = await getIdToken();
  if (!token.ok) {
    return token;
  }

  let response: Response;
  try {
    response = await fetch(
      `/api/reservations/${encodeURIComponent(reservationId)}`,
      {
        headers: { Authorization: `Bearer ${token.idToken}` },
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
      message: "예약 상세 요청에 실패했습니다. 다시 시도해 주세요.",
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
