import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma-client";
import { isVocCategory, VOC_CATEGORY_LABELS } from "@/lib/domain-constants";
import { maskName, VOC_DEDUP_WINDOW_MS, type VocValidated } from "@/lib/voc";
import { hashVocPassword, verifyVocPassword } from "@/lib/server/voc-password";
import type { VocPost } from "@/types/domain";

// 공개 문의 게시판(고객의 소리) 저장소. 목록/상세 공개 응답은 마스킹된 성명만 노출하고
// 연락처/이메일/비밀번호 해시는 절대 반환하지 않는다. 본문은 비밀번호 인증 후에만 채운다.

// 마이페이지 목록·KMI와 동일하게 페이지당 10개.
export const VOC_PAGE_SIZE = 10;

type VocPostRow = Prisma.VocPostGetPayload<Prisma.VocPostDefaultArgs>;

function toPublicVocPost(
  row: VocPostRow,
  // maskAuthor=false는 본인 글 조회(마이페이지)에서만 쓴다. 공개 목록/상세는 항상 마스킹한다.
  { includeBody, maskAuthor = true }: { includeBody: boolean; maskAuthor?: boolean },
): VocPost {
  if (!isVocCategory(row.category)) {
    throw new Error(`VOC ${row.id}의 category가 알 수 없는 값입니다: ${row.category}`);
  }
  return {
    id: row.id,
    category: row.category,
    gymId: row.gymId,
    authorName: maskAuthor ? maskName(row.authorName) : row.authorName,
    body: includeBody ? row.body : "",
    createdAt: row.createdAt.toISOString(),
    title: row.title,
  };
}

// 멱등: 같은 작성자(userId)+성명+분류+본문을 VOC_DEDUP_WINDOW_MS 내 재전송하면 기존 글을
// 재사용한다(작성 더블클릭·네트워크 재시도 시 중복 레코드 방지). reused=true면 신규 생성이 아니다.
// userId도 매칭에 포함한다 — 동명의 다른 사람(익명 vs 로그인) 글이 오병합되어 두 번째 작성자의
// 비밀번호·연락처가 유실되는 것을 막는다.
export async function createVocPost(
  input: VocValidated,
  // 로그인 사용자가 작성하면 uid를 함께 저장해 마이페이지 문의 내역에 노출한다. 익명이면 null.
  userId: string | null = null,
): Promise<{ post: VocPost; reused: boolean }> {
  const since = new Date(Date.now() - VOC_DEDUP_WINDOW_MS);
  const existing = await prisma.vocPost.findFirst({
    where: {
      userId,
      authorName: input.authorName,
      category: input.category,
      body: input.body,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    return { post: toPublicVocPost(existing, { includeBody: false }), reused: true };
  }

  const row = await prisma.vocPost.create({
    data: {
      category: input.category,
      gymId: input.gymId,
      userId,
      authorName: input.authorName,
      phone: input.phone,
      email: input.email,
      // 제목은 별도로 받지 않고 분류 라벨을 저장한다(KMI 고객의 소리와 동일: 목록 제목=분류).
      title: VOC_CATEGORY_LABELS[input.category],
      body: input.body,
      passwordHash: hashVocPassword(input.password),
    },
  });
  return { post: toPublicVocPost(row, { includeBody: false }), reused: false };
}

// 마이페이지 문의 내역: 로그인 사용자가 작성한 게시판 글을 최신순으로 페이지 단위 조회한다.
// 본문/연락처/비밀번호는 제외한다. 본인 글이라 성명은 마스킹하지 않는다.
export async function listUserVocPosts(
  userId: string,
  { page = 1 }: { page?: number } = {},
): Promise<{ posts: VocPost[]; total: number }> {
  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const [rows, total] = await Promise.all([
    prisma.vocPost.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * VOC_PAGE_SIZE,
      take: VOC_PAGE_SIZE,
    }),
    prisma.vocPost.count({ where: { userId } }),
  ]);
  return {
    posts: rows.map((row) =>
      toPublicVocPost(row, { includeBody: false, maskAuthor: false }),
    ),
    total,
  };
}

export async function listVocPosts({
  page = 1,
}: {
  page?: number;
} = {}): Promise<{ posts: VocPost[]; total: number }> {
  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const [rows, total] = await Promise.all([
    prisma.vocPost.findMany({
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * VOC_PAGE_SIZE,
      take: VOC_PAGE_SIZE,
    }),
    prisma.vocPost.count(),
  ]);
  return {
    posts: rows.map((row) => toPublicVocPost(row, { includeBody: false })),
    total,
  };
}

export type VerifyVocPostResult =
  | { ok: true; post: VocPost }
  | { ok: false; reason: "not-found" | "invalid-password" };

export async function verifyVocPost(
  id: string,
  password: string,
): Promise<VerifyVocPostResult> {
  const row = await prisma.vocPost.findUnique({ where: { id } });
  if (!row) {
    return { ok: false, reason: "not-found" };
  }
  if (!verifyVocPassword(password, row.passwordHash)) {
    return { ok: false, reason: "invalid-password" };
  }
  return { ok: true, post: toPublicVocPost(row, { includeBody: true }) };
}
