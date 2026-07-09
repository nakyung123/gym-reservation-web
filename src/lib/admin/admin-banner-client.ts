"use client";

import { getAdminAuthHeader } from "@/lib/admin/admin-auth-headers";
import { isBanner, type Banner, type BannerMetaInput } from "@/lib/admin/banner";

import { isAbortError } from "@/lib/async-error";
export type BannerListResult =
  | { ok: true; banners: Banner[] }
  | { ok: false; message: string; status?: number };

export type BannerMutationResult =
  | { ok: true; banner: Banner }
  | { ok: false; message: string; status?: number };

export type BannerDeleteResult =
  | { ok: true }
  | { ok: false; message: string; status?: number };


function getMessage(data: { message?: unknown }, fallback: string) {
  return typeof data.message === "string" ? data.message : fallback;
}

function isBannerArray(value: unknown): value is Banner[] {
  return Array.isArray(value) && value.every(isBanner);
}

// 메타 + (선택) 이미지 파일을 multipart FormData로 만든다.
// Content-Type은 브라우저가 boundary와 함께 설정하므로 직접 지정하지 않는다.
function buildBannerForm(meta: BannerMetaInput, image: File | null): FormData {
  const form = new FormData();
  if (image) form.set("image", image);
  if (meta.linkUrl) form.set("linkUrl", meta.linkUrl);
  if (meta.title) form.set("title", meta.title);
  form.set("sortOrder", String(meta.sortOrder));
  form.set("isActive", meta.isActive ? "true" : "false");
  if (meta.startsAt) form.set("startsAt", meta.startsAt);
  if (meta.endsAt) form.set("endsAt", meta.endsAt);
  return form;
}

export async function fetchBanners(
  signal?: AbortSignal,
): Promise<BannerListResult> {
  const auth = await getAdminAuthHeader();
  if (!auth.ok) return { ok: false, message: auth.message, status: 401 };

  let response: Response;
  try {
    response = await fetch("/api/admin/banners", {
      headers: auth.headers,
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    return { ok: false, message: "배너 목록 요청에 실패했습니다." };
  }

  let data: { banners?: unknown; message?: unknown };
  try {
    data = (await response.json()) as { banners?: unknown; message?: unknown };
  } catch {
    return {
      ok: false,
      message: "응답 형식이 올바르지 않습니다.",
      status: response.status,
    };
  }

  if (response.ok && isBannerArray(data.banners)) {
    return { ok: true, banners: data.banners };
  }
  if (response.ok) {
    return {
      ok: false,
      message: "배너 목록 응답 형식이 올바르지 않습니다.",
      status: response.status,
    };
  }
  return {
    ok: false,
    message: getMessage(data, `배너 목록 조회 실패: status=${response.status}`),
    status: response.status,
  };
}

async function submitBanner(
  url: string,
  method: "POST" | "PATCH",
  meta: BannerMetaInput,
  image: File | null,
  signal?: AbortSignal,
): Promise<BannerMutationResult> {
  const auth = await getAdminAuthHeader();
  if (!auth.ok) return { ok: false, message: auth.message, status: 401 };

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: auth.headers,
      body: buildBannerForm(meta, image),
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    return { ok: false, message: "배너 저장 요청에 실패했습니다." };
  }

  let data: { banner?: unknown; message?: unknown };
  try {
    data = (await response.json()) as { banner?: unknown; message?: unknown };
  } catch {
    return {
      ok: false,
      message: "응답 형식이 올바르지 않습니다.",
      status: response.status,
    };
  }

  if (response.ok && isBanner(data.banner)) {
    return { ok: true, banner: data.banner };
  }
  if (response.ok) {
    return {
      ok: false,
      message: "배너 저장 응답 형식이 올바르지 않습니다.",
      status: response.status,
    };
  }
  return {
    ok: false,
    message: getMessage(data, `배너 저장 실패: status=${response.status}`),
    status: response.status,
  };
}

// 생성 시 이미지는 필수.
export async function createBannerRequest(
  meta: BannerMetaInput,
  image: File,
  signal?: AbortSignal,
): Promise<BannerMutationResult> {
  return submitBanner("/api/admin/banners", "POST", meta, image, signal);
}

// 수정 시 이미지는 선택(없으면 메타만 변경).
export async function updateBannerRequest(
  id: string,
  meta: BannerMetaInput,
  image: File | null,
  signal?: AbortSignal,
): Promise<BannerMutationResult> {
  return submitBanner(
    `/api/admin/banners/${encodeURIComponent(id)}`,
    "PATCH",
    meta,
    image,
    signal,
  );
}

export async function deleteBannerRequest(
  id: string,
  signal?: AbortSignal,
): Promise<BannerDeleteResult> {
  const auth = await getAdminAuthHeader();
  if (!auth.ok) return { ok: false, message: auth.message, status: 401 };

  let response: Response;
  try {
    response = await fetch(`/api/admin/banners/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: auth.headers,
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    return { ok: false, message: "배너 삭제 요청에 실패했습니다." };
  }

  if (response.ok) return { ok: true };

  let data: { message?: unknown };
  try {
    data = (await response.json()) as { message?: unknown };
  } catch {
    return {
      ok: false,
      message: `배너 삭제 실패: status=${response.status}`,
      status: response.status,
    };
  }
  return {
    ok: false,
    message: getMessage(data, `배너 삭제 실패: status=${response.status}`),
    status: response.status,
  };
}
