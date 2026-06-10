import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/admin/customers/[userId]/notes/route";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { createUserNote } from "@/lib/server/db-user-note-repository";
import { prisma } from "@/lib/server/prisma-client";

vi.mock("@/lib/server/admin-auth", () => ({
  verifyAdminTokenFromRequest: vi.fn(),
}));

const ADMIN_BEARER = "Bearer admin-test-id-token";

function notesUrl(userId: string) {
  return `http://localhost:3000/api/admin/customers/${encodeURIComponent(userId)}/notes`;
}

function getRequest(userId: string, bearer = ADMIN_BEARER) {
  return new NextRequest(notesUrl(userId), {
    headers: { authorization: bearer },
  });
}

function postRequest(userId: string, body: unknown, bearer = ADMIN_BEARER) {
  return new NextRequest(notesUrl(userId), {
    method: "POST",
    headers: { "Content-Type": "application/json", authorization: bearer },
    body: JSON.stringify(body),
  });
}

function contextFor(userId: string) {
  return { params: Promise.resolve({ userId }) };
}

function setAdminAuthOk() {
  vi.mocked(verifyAdminTokenFromRequest).mockResolvedValue({
    ok: true,
    uid: "admin-test-uid",
  });
}

describe("POST /api/admin/customers/[userId]/notes", () => {
  beforeEach(() => {
    setAdminAuthOk();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("메모를 생성하고 audit 로그를 남긴다", async () => {
    const response = await POST(
      postRequest("note-create-user", { body: "  관리자 메모 내용  " }),
      contextFor("note-create-user"),
    );
    const body = (await response.json()) as { note?: { body?: unknown } };

    expect(response.status).toBe(200);
    // 앞뒤 공백은 trim되어 저장된다.
    expect(body.note?.body).toBe("관리자 메모 내용");

    const notes = await prisma.userNote.findMany({
      where: { userId: "note-create-user" },
    });
    expect(notes).toHaveLength(1);

    const audit = await prisma.auditLog.findMany({
      where: {
        targetType: "user",
        targetId: "note-create-user",
        action: "customer_note.create",
      },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.adminUid).toBe("admin-test-uid");
    // 메모 본문은 audit summary에 노출하지 않는다.
    expect(audit[0]?.summary).not.toContain("관리자 메모 내용");
  });

  it("빈 본문은 400을 반환하고 생성하지 않는다", async () => {
    const response = await POST(
      postRequest("note-empty-user", { body: "   " }),
      contextFor("note-empty-user"),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("메모 내용을 입력해 주세요.");
    expect(await prisma.userNote.count({ where: { userId: "note-empty-user" } })).toBe(0);
  });

  it("Authorization 헤더가 없으면 401을 반환하고 생성하지 않는다", async () => {
    vi.mocked(verifyAdminTokenFromRequest).mockResolvedValueOnce({
      ok: false,
      status: 401,
      message: "관리자 인증이 필요합니다.",
    });

    const response = await POST(
      new NextRequest(notesUrl("note-noauth-user"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "x" }),
      }),
      contextFor("note-noauth-user"),
    );

    expect(response.status).toBe(401);
    expect(await prisma.userNote.count({ where: { userId: "note-noauth-user" } })).toBe(0);
  });
});

describe("GET /api/admin/customers/[userId]/notes", () => {
  beforeEach(() => {
    setAdminAuthOk();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("해당 고객의 메모를 최신순으로 반환한다", async () => {
    await createUserNote({
      userId: "note-list-user",
      adminUid: "admin-test-uid",
      body: "첫 메모",
    });
    await createUserNote({
      userId: "note-list-user",
      adminUid: "admin-test-uid",
      body: "둘째 메모",
    });

    const response = await GET(
      getRequest("note-list-user"),
      contextFor("note-list-user"),
    );
    const body = (await response.json()) as { notes?: unknown[] };

    expect(response.status).toBe(200);
    expect(body.notes).toHaveLength(2);
  });
});
