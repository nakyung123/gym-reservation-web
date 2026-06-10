import "server-only";
import type { UserNote as UserNoteRow } from "@prisma/client";
import type { CustomerNote } from "@/lib/admin/customer-note";
import { prisma } from "@/lib/server/prisma-client";

// 관리자 고객 메모(UserNote) 저장소. userId는 대상 고객 Firebase uid, adminUid는 작성 관리자.

const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 200;

function toCustomerNote(row: UserNoteRow): CustomerNote {
  return {
    id: row.id,
    userId: row.userId,
    adminUid: row.adminUid,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createUserNote(input: {
  userId: string;
  adminUid: string;
  body: string;
}): Promise<CustomerNote> {
  const row = await prisma.userNote.create({
    data: {
      userId: input.userId,
      adminUid: input.adminUid,
      body: input.body,
    },
  });
  return toCustomerNote(row);
}

export async function listUserNotes(
  userId: string,
  limit = DEFAULT_LIST_LIMIT,
): Promise<CustomerNote[]> {
  const rows = await prisma.userNote.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, MAX_LIST_LIMIT),
  });
  return rows.map(toCustomerNote);
}

// noteId가 해당 userId 소유일 때만 삭제한다(다른 고객 메모를 교차 삭제하지 못하게 범위 제한).
// 이미 삭제된 메모를 다시 삭제하면 ok:false(없음)로 응답한다 — idempotent하게 안전.
export async function deleteUserNote(
  noteId: string,
  userId: string,
): Promise<{ ok: boolean }> {
  const result = await prisma.userNote.deleteMany({
    where: { id: noteId, userId },
  });
  return { ok: result.count > 0 };
}
