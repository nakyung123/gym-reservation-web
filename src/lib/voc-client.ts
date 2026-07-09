"use client";

import { getFirebaseClient } from "@/lib/firebase-client";
import { isVocPost, type VocInput } from "@/lib/voc";
import type { VocPost } from "@/types/domain";

import { isAbortError } from "@/lib/async-error";
// 공개 문의 게시판 client 접근 계층(작성/비밀번호 인증/내 문의 목록). throw 대신 { ok, ... } 결과를 반환한다.

export type CreateVocResult =
  | { ok: true; post: VocPost }
  | { ok: false; message: string };

export type VerifyVocResult =
  | { ok: true; post: VocPost }
  | { ok: false; kind: "not-found" | "invalid-password" | "error"; message: string };

export type FetchMyVocResult =
  | { ok: true; posts: VocPost[]; total: number }
  | { ok: false; kind: "auth-required" | "error"; message: string };


// 로그인 상태면 ID 토큰을 반환한다. 비로그인/실패면 null(작성은 익명으로 진행 가능).
async function tryGetIdToken(): Promise<string | null> {
  try {
    const { auth } = getFirebaseClient();
    if (!auth.currentUser) return null;
    return await auth.currentUser.getIdToken();
  } catch {
    return null;
  }
}

async function readJson(
  response: Response,
): Promise<{ post?: unknown; message?: unknown }> {
  try {
    return (await response.json()) as { post?: unknown; message?: unknown };
  } catch {
    return { message: "응답 형식이 올바르지 않습니다." };
  }
}

function msg(data: { message?: unknown }, fallback: string): string {
  return typeof data.message === "string" ? data.message : fallback;
}

// 작성. password는 숫자 4자리(서버가 해시 저장). 서버 검증과 동일한 규칙을 서버가 재검증한다.
export async function createVocPost(
  input: Omit<VocInput, "category"> & { category: string },
): Promise<CreateVocResult> {
  // 로그인 상태면 토큰을 실어 보내 글을 계정에 연결한다(마이페이지 문의 내역 노출). 없으면 익명.
  const idToken = await tryGetIdToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;

  let response: Response;
  try {
    response = await fetch("/api/voc", {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, message: "문의 등록 요청에 실패했습니다. 다시 시도해 주세요." };
  }

  const data = await readJson(response);
  if (response.ok && isVocPost(data.post)) {
    return { ok: true, post: data.post };
  }
  return { ok: false, message: msg(data, "문의 등록에 실패했습니다.") };
}

export async function verifyVocPost(
  id: string,
  password: string,
): Promise<VerifyVocResult> {
  let response: Response;
  try {
    response = await fetch(`/api/voc/${encodeURIComponent(id)}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
  } catch {
    return {
      ok: false,
      kind: "error",
      message: "문의 조회 요청에 실패했습니다. 다시 시도해 주세요.",
    };
  }

  const data = await readJson(response);
  if (response.ok && isVocPost(data.post)) {
    return { ok: true, post: data.post };
  }
  if (response.status === 404) {
    return { ok: false, kind: "not-found", message: msg(data, "문의를 찾을 수 없습니다.") };
  }
  if (response.status === 401) {
    return {
      ok: false,
      kind: "invalid-password",
      message: msg(data, "비밀번호가 일치하지 않습니다."),
    };
  }
  return { ok: false, kind: "error", message: msg(data, "문의를 불러오지 못했습니다.") };
}

// 마이페이지 문의 내역: 로그인 사용자가 작성한 게시판 글 목록(최신순, 페이지 단위).
export async function fetchMyVocPosts(
  page = 1,
  signal?: AbortSignal,
): Promise<FetchMyVocResult> {
  const idToken = await tryGetIdToken();
  if (!idToken) {
    return {
      ok: false,
      kind: "auth-required",
      message: "로그인 정보가 없어 문의 내역을 불러올 수 없습니다.",
    };
  }

  let response: Response;
  try {
    response = await fetch(`/api/voc/mine?page=${encodeURIComponent(String(page))}`, {
      headers: { Authorization: `Bearer ${idToken}` },
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    return {
      ok: false,
      kind: "error",
      message: "문의 내역 요청에 실패했습니다. 다시 시도해 주세요.",
    };
  }

  const data = (await readJson(response)) as {
    posts?: unknown;
    total?: unknown;
    message?: unknown;
  };
  if (
    response.ok &&
    Array.isArray(data.posts) &&
    data.posts.every(isVocPost) &&
    typeof data.total === "number"
  ) {
    return { ok: true, posts: data.posts, total: data.total };
  }
  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      kind: "auth-required",
      message: msg(data, "로그인 상태가 필요합니다."),
    };
  }
  return { ok: false, kind: "error", message: msg(data, "문의 내역을 불러오지 못했습니다.") };
}
