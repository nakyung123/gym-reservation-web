"use client";

import { getAdminAuthHeader } from "@/lib/admin/admin-auth-headers";
import {
  isAdminGym,
  type AdminGymUpdateInput,
} from "@/lib/admin/admin-gym-schema";
import type { AdminGym } from "@/types/domain";

import { isAbortError } from "@/lib/async-error";
export type AdminGymMutationPayload = AdminGym | AdminGymUpdateInput;

export type AdminGymListResult =
  | { ok: true; gyms: AdminGym[] }
  | { ok: false; message: string; status?: number };

export type AdminGymMutationResult =
  | { ok: true; gym: AdminGym; message: string }
  | { ok: false; message: string; status?: number };


async function readJsonResponse(
  response: Response,
): Promise<{ gym?: unknown; gyms?: unknown; message?: unknown }> {
  try {
    return (await response.json()) as {
      gym?: unknown;
      gyms?: unknown;
      message?: unknown;
    };
  } catch {
    return { message: "응답 형식이 올바르지 않습니다." };
  }
}

function getMessage(data: { message?: unknown }, fallback: string): string {
  return typeof data.message === "string" ? data.message : fallback;
}

export async function fetchAdminGyms(
  signal?: AbortSignal,
): Promise<AdminGymListResult> {
  const auth = await getAdminAuthHeader();
  if (!auth.ok) return { ok: false, message: auth.message, status: 401 };

  let response: Response;
  try {
    response = await fetch("/api/admin/gyms", {
      headers: auth.headers,
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return {
      ok: false,
      message: "시설 목록 요청에 실패했습니다. 다시 시도해 주세요.",
    };
  }

  const data = await readJsonResponse(response);
  if (!response.ok) {
    return {
      ok: false,
      message: getMessage(data, `시설 목록 조회 실패: status=${response.status}`),
      status: response.status,
    };
  }

  if (!Array.isArray(data.gyms) || !data.gyms.every(isAdminGym)) {
    return {
      ok: false,
      message: "시설 목록 응답 형식이 올바르지 않습니다.",
      status: response.status,
    };
  }

  return { ok: true, gyms: data.gyms };
}

export async function createAdminGym(
  payload: AdminGym,
): Promise<AdminGymMutationResult> {
  return mutateAdminGym("/api/admin/gyms", "POST", payload);
}

export async function updateAdminGym(
  gymId: string,
  payload: AdminGymUpdateInput,
): Promise<AdminGymMutationResult> {
  return mutateAdminGym(
    `/api/admin/gyms/${encodeURIComponent(gymId)}`,
    "PATCH",
    payload,
  );
}

async function mutateAdminGym(
  url: string,
  method: "POST" | "PATCH",
  payload: AdminGymMutationPayload,
): Promise<AdminGymMutationResult> {
  const auth = await getAdminAuthHeader();
  if (!auth.ok) return { ok: false, message: auth.message, status: 401 };

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...auth.headers,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return {
      ok: false,
      message: "시설 저장 요청에 실패했습니다. 다시 시도해 주세요.",
    };
  }

  const data = await readJsonResponse(response);
  if (response.ok && isAdminGym(data.gym)) {
    return {
      ok: true,
      gym: data.gym,
      message: getMessage(data, "시설 정보가 저장되었습니다."),
    };
  }

  if (response.ok) {
    return {
      ok: false,
      message: "시설 저장 응답 형식이 올바르지 않습니다.",
      status: response.status,
    };
  }

  return {
    ok: false,
    message: getMessage(data, `시설 저장 실패: status=${response.status}`),
    status: response.status,
  };
}
