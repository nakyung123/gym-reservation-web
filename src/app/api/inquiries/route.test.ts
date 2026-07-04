import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/inquiries/route";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM } from "@tests/setup-db";

const { verifyIdToken } = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
}));

function authHeaders(idToken = "test-id-token") {
  return { Authorization: `Bearer ${idToken}` };
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/inquiries", {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getRequest(page?: number) {
  const url = page
    ? `http://localhost:3000/api/inquiries?page=${page}`
    : "http://localhost:3000/api/inquiries";
  return new NextRequest(url, { headers: authHeaders() });
}

describe("POST /api/inquiries", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("미인증이면 401", async () => {
    verifyIdToken.mockRejectedValue(new Error("invalid"));
    const response = await POST(postRequest({ title: "제목", body: "내용" }));
    expect(response.status).toBe(401);
  });

  it("정상 등록 시 201과 open 상태 inquiry를 반환한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "inq-route-user" });
    const response = await POST(postRequest({ title: "제목", body: "내용입니다" }));
    const data = (await response.json()) as {
      ok?: unknown;
      inquiry?: { status?: unknown; userId?: unknown };
    };

    expect(response.status).toBe(201);
    expect(data.ok).toBe(true);
    expect(data.inquiry?.status).toBe("open");
    expect(data.inquiry?.userId).toBe("inq-route-user");
    expect(await prisma.inquiry.count()).toBe(1);
  });

  it("제목이 비면 400", async () => {
    verifyIdToken.mockResolvedValue({ uid: "inq-route-user" });
    const response = await POST(postRequest({ title: "", body: "내용" }));
    expect(response.status).toBe(400);
    expect(await prisma.inquiry.count()).toBe(0);
  });

  it("존재하지 않는 gymId면 400", async () => {
    verifyIdToken.mockResolvedValue({ uid: "inq-route-user" });
    const response = await POST(
      postRequest({ title: "제목", body: "내용", gymId: "no-such-gym" }),
    );
    expect(response.status).toBe(400);
  });

  it("실재 gymId면 연결되어 등록된다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "inq-route-user" });
    const response = await POST(
      postRequest({ title: "시설문의", body: "내용", gymId: TEST_GYM.id }),
    );
    const data = (await response.json()) as { inquiry?: { gymId?: unknown } };
    expect(response.status).toBe(201);
    expect(data.inquiry?.gymId).toBe(TEST_GYM.id);
  });

  it("동일 내용 60초 내 재전송은 중복 생성하지 않는다(멱등)", async () => {
    verifyIdToken.mockResolvedValue({ uid: "inq-route-user" });
    await POST(postRequest({ title: "중복", body: "같은내용" }));
    await POST(postRequest({ title: "중복", body: "같은내용" }));
    expect(await prisma.inquiry.count()).toBe(1);
  });
});

describe("GET /api/inquiries", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("미인증이면 401", async () => {
    verifyIdToken.mockRejectedValue(new Error("invalid"));
    const response = await GET(getRequest());
    expect(response.status).toBe(401);
  });

  it("본인 문의만 반환한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "list-user" });
    await POST(postRequest({ title: "내문의", body: "내용" }));
    // 다른 사용자 문의는 목록에 안 나와야 함
    await prisma.inquiry.create({
      data: { userId: "other-user", title: "남의문의", body: "x", status: "open" },
    });

    const response = await GET(getRequest());
    const data = (await response.json()) as {
      inquiries?: { userId?: unknown }[];
      total?: unknown;
    };
    expect(response.status).toBe(200);
    expect(data.total).toBe(1);
    expect(data.inquiries?.every((i) => i.userId === "list-user")).toBe(true);
  });
});
