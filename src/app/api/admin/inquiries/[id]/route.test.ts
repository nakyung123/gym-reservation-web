import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "@/app/api/admin/inquiries/[id]/route";
import { createInquiryInDb } from "@/lib/server/db-inquiry-repository";
import "@tests/setup-db";

const { verifyIdToken } = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
}));

function patchRequest(id: string, body: unknown) {
  const request = new NextRequest(
    `http://localhost:3000/api/admin/inquiries/${id}`,
    {
      method: "PATCH",
      headers: {
        Authorization: "Bearer test-id-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  return PATCH(request, { params: Promise.resolve({ id }) });
}

async function createOpenInquiry() {
  const { inquiry } = await createInquiryInDb({
    userId: "owner",
    title: "제목",
    body: "내용",
    gymId: null,
  });
  return inquiry;
}

describe("PATCH /api/admin/inquiries/[id]", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("미인증이면 401", async () => {
    verifyIdToken.mockRejectedValue(new Error("invalid"));
    const response = await patchRequest("some-id", { answer: "답변" });
    expect(response.status).toBe(401);
  });

  it("admin claim이 없으면 403", async () => {
    verifyIdToken.mockResolvedValue({ uid: "normal-user" });
    const response = await patchRequest("some-id", { answer: "답변" });
    expect(response.status).toBe(403);
  });

  it("관리자가 답변하면 200과 answered 상태를 반환한다", async () => {
    const inquiry = await createOpenInquiry();
    verifyIdToken.mockResolvedValue({ uid: "admin-user", admin: true });

    const response = await patchRequest(inquiry.id, { answer: "답변 드립니다." });
    const data = (await response.json()) as {
      ok?: unknown;
      inquiry?: { status?: unknown; answer?: unknown };
    };
    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.inquiry?.status).toBe("answered");
    expect(data.inquiry?.answer).toBe("답변 드립니다.");
  });

  it("빈 답변은 400", async () => {
    const inquiry = await createOpenInquiry();
    verifyIdToken.mockResolvedValue({ uid: "admin-user", admin: true });
    const response = await patchRequest(inquiry.id, { answer: "  " });
    expect(response.status).toBe(400);
  });

  it("없는 문의면 404", async () => {
    verifyIdToken.mockResolvedValue({ uid: "admin-user", admin: true });
    const response = await patchRequest("no-such-id", { answer: "답변" });
    expect(response.status).toBe(404);
  });
});
