import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "@/app/api/admin/customers/[userId]/notes/[noteId]/route";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { createUserNote } from "@/lib/server/db-user-note-repository";
import { prisma } from "@/lib/server/prisma-client";

vi.mock("@/lib/server/admin-auth", () => ({
  verifyAdminTokenFromRequest: vi.fn(),
}));

const ADMIN_BEARER = "Bearer admin-test-id-token";

function deleteRequest(userId: string, noteId: string, bearer = ADMIN_BEARER) {
  return new NextRequest(
    `http://localhost:3000/api/admin/customers/${encodeURIComponent(userId)}/notes/${encodeURIComponent(noteId)}`,
    { method: "DELETE", headers: { authorization: bearer } },
  );
}

function contextFor(userId: string, noteId: string) {
  return { params: Promise.resolve({ userId, noteId }) };
}

function setAdminAuthOk() {
  vi.mocked(verifyAdminTokenFromRequest).mockResolvedValue({
    ok: true,
    uid: "admin-test-uid",
  });
}

describe("DELETE /api/admin/customers/[userId]/notes/[noteId]", () => {
  beforeEach(() => {
    setAdminAuthOk();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("메모를 삭제하고 audit 로그를 남긴다", async () => {
    const note = await createUserNote({
      userId: "note-del-user",
      adminUid: "admin-test-uid",
      body: "삭제할 메모",
    });

    const response = await DELETE(
      deleteRequest("note-del-user", note.id),
      contextFor("note-del-user", note.id),
    );
    const body = (await response.json()) as { ok?: unknown };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    await expect(
      prisma.userNote.findUnique({ where: { id: note.id } }),
    ).resolves.toBeNull();

    const audit = await prisma.auditLog.findMany({
      where: {
        targetType: "user",
        targetId: "note-del-user",
        action: "customer_note.delete",
      },
    });
    expect(audit).toHaveLength(1);
  });

  it("존재하지 않는 메모는 404를 반환한다", async () => {
    const response = await DELETE(
      deleteRequest("note-del-user", "missing-note"),
      contextFor("note-del-user", "missing-note"),
    );

    expect(response.status).toBe(404);
  });

  it("다른 고객의 메모는 교차 삭제할 수 없다(404)", async () => {
    const note = await createUserNote({
      userId: "note-owner",
      adminUid: "admin-test-uid",
      body: "주인 메모",
    });

    const response = await DELETE(
      deleteRequest("other-user", note.id),
      contextFor("other-user", note.id),
    );

    expect(response.status).toBe(404);
    // 원래 메모는 그대로 남아 있어야 한다.
    await expect(
      prisma.userNote.findUnique({ where: { id: note.id } }),
    ).resolves.not.toBeNull();
  });

  it("admin claim이 없으면 403을 반환하고 삭제하지 않는다", async () => {
    const note = await createUserNote({
      userId: "note-del-noauth",
      adminUid: "admin-test-uid",
      body: "보호 메모",
    });
    vi.mocked(verifyAdminTokenFromRequest).mockResolvedValueOnce({
      ok: false,
      status: 403,
      message: "관리자 권한이 없습니다.",
    });

    const response = await DELETE(
      deleteRequest("note-del-noauth", note.id),
      contextFor("note-del-noauth", note.id),
    );

    expect(response.status).toBe(403);
    await expect(
      prisma.userNote.findUnique({ where: { id: note.id } }),
    ).resolves.not.toBeNull();
  });
});
