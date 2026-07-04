import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/inquiries/[id]/route";
import { createInquiryInDb } from "@/lib/server/db-inquiry-repository";
import "@tests/setup-db";

const { verifyIdToken } = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
}));

function getRequest(id: string) {
  const request = new NextRequest(`http://localhost:3000/api/inquiries/${id}`, {
    headers: { Authorization: "Bearer test-id-token" },
  });
  return GET(request, { params: Promise.resolve({ id }) });
}

describe("GET /api/inquiries/[id]", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("미인증이면 401", async () => {
    verifyIdToken.mockRejectedValue(new Error("invalid"));
    const response = await getRequest("some-id");
    expect(response.status).toBe(401);
  });

  it("본인 문의는 200으로 반환한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "owner" });
    const { inquiry } = await createInquiryInDb({
      userId: "owner",
      title: "제목",
      body: "내용",
      gymId: null,
    });

    const response = await getRequest(inquiry.id);
    const data = (await response.json()) as { ok?: unknown; inquiry?: { id?: unknown } };
    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.inquiry?.id).toBe(inquiry.id);
  });

  it("남의 문의를 요청하면 404로 은닉한다(IDOR 차단)", async () => {
    const { inquiry } = await createInquiryInDb({
      userId: "owner",
      title: "제목",
      body: "내용",
      gymId: null,
    });
    // 다른 사용자로 인증
    verifyIdToken.mockResolvedValue({ uid: "attacker" });

    const response = await getRequest(inquiry.id);
    expect(response.status).toBe(404);
  });
});
