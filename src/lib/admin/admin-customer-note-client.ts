"use client";

import { getAdminAuthHeader } from "@/lib/admin/admin-auth-headers";
import { isCustomerNote, type CustomerNote } from "@/lib/admin/customer-note";

import { isAbortError } from "@/lib/async-error";
export type CreateNoteResult =
  | { ok: true; note: CustomerNote }
  | { ok: false; message: string; status?: number };

export type DeleteNoteResult =
  | { ok: true }
  | { ok: false; message: string; status?: number };


function getMessage(data: { message?: unknown }, fallback: string) {
  return typeof data.message === "string" ? data.message : fallback;
}

export async function createAdminCustomerNote(
  userId: string,
  body: string,
  signal?: AbortSignal,
): Promise<CreateNoteResult> {
  const auth = await getAdminAuthHeader();
  if (!auth.ok) return { ok: false, message: auth.message, status: 401 };

  let response: Response;
  try {
    response = await fetch(
      `/api/admin/customers/${encodeURIComponent(userId)}/notes`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth.headers },
        body: JSON.stringify({ body }),
        signal,
      },
    );
  } catch (error) {
    if (isAbortError(error)) throw error;
    return {
      ok: false,
      message: "메모 저장 요청에 실패했습니다. 다시 시도해 주세요.",
    };
  }

  let data: { note?: unknown; message?: unknown };
  try {
    data = (await response.json()) as { note?: unknown; message?: unknown };
  } catch {
    return {
      ok: false,
      message: "응답 형식이 올바르지 않습니다.",
      status: response.status,
    };
  }

  if (response.ok && isCustomerNote(data.note)) {
    return { ok: true, note: data.note };
  }

  if (response.ok) {
    return {
      ok: false,
      message: "메모 저장 응답 형식이 올바르지 않습니다.",
      status: response.status,
    };
  }

  return {
    ok: false,
    message: getMessage(data, `메모 저장 실패: status=${response.status}`),
    status: response.status,
  };
}

export async function deleteAdminCustomerNote(
  userId: string,
  noteId: string,
  signal?: AbortSignal,
): Promise<DeleteNoteResult> {
  const auth = await getAdminAuthHeader();
  if (!auth.ok) return { ok: false, message: auth.message, status: 401 };

  let response: Response;
  try {
    response = await fetch(
      `/api/admin/customers/${encodeURIComponent(userId)}/notes/${encodeURIComponent(noteId)}`,
      { method: "DELETE", headers: auth.headers, signal },
    );
  } catch (error) {
    if (isAbortError(error)) throw error;
    return {
      ok: false,
      message: "메모 삭제 요청에 실패했습니다. 다시 시도해 주세요.",
    };
  }

  if (response.ok) {
    return { ok: true };
  }

  let data: { message?: unknown };
  try {
    data = (await response.json()) as { message?: unknown };
  } catch {
    return {
      ok: false,
      message: `메모 삭제 실패: status=${response.status}`,
      status: response.status,
    };
  }

  return {
    ok: false,
    message: getMessage(data, `메모 삭제 실패: status=${response.status}`),
    status: response.status,
  };
}
