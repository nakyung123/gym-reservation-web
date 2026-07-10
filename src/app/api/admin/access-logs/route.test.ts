import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/admin/access-logs/route";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { recordAdminAccess } from "@/lib/server/db-admin-access-repository";
import { prisma } from "@/lib/server/prisma-client";

vi.mock("@/lib/server/admin-auth", () => ({
  verifyAdminTokenFromRequest: vi.fn(),
}));

const ADMIN_BEARER = "Bearer admin-test-id-token";
const BASE_URL = "http://localhost:3000/api/admin/access-logs";

function setAdminAuthOk(uid = "admin-test-uid") {
  vi.mocked(verifyAdminTokenFromRequest).mockResolvedValue({ ok: true, uid });
}

function getRequest(url: string, bearer = ADMIN_BEARER) {
  return new NextRequest(url, { headers: { authorization: bearer } });
}

function postRequest(body: unknown, bearer = ADMIN_BEARER) {
  return new NextRequest(BASE_URL, {
    method: "POST",
    headers: {
      authorization: bearer,
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0 (RouteTest)",
      "x-forwarded-for": "203.0.113.55",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/access-logs", () => {
  beforeEach(() => {
    setAdminAuthOk();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("관리자 인증을 통과하면 접속을 기록하고 204를 반환한다", async () => {
    const response = await POST(postRequest({ path: "/admin/gyms" }));
    expect(response.status).toBe(204);

    const rows = await prisma.adminAccessLog.findMany({
      where: { adminUid: "admin-test-uid" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.path).toBe("/admin/gyms");
    expect(rows[0]?.ip).toBe("203.0.113.55");
  });

  it("admin 외 경로가 오면 기본 경로(/admin)로 기록한다", async () => {
    const response = await POST(postRequest({ path: "https://evil.example" }));
    expect(response.status).toBe(204);

    const rows = await prisma.adminAccessLog.findMany({});
    expect(rows[0]?.path).toBe("/admin");
  });

  it("기록이 실패해도 콘솔 진입을 막지 않도록 204를 반환한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.adminAccessLog, "create").mockRejectedValueOnce(
      new Error("database offline"),
    );

    const response = await POST(postRequest({ path: "/admin" }));
    expect(response.status).toBe(204);
  });

  it("Authorization 헤더가 없으면 401을 반환하고 기록하지 않는다", async () => {
    vi.mocked(verifyAdminTokenFromRequest).mockResolvedValueOnce({
      ok: false,
      status: 401,
      message: "관리자 인증이 필요합니다.",
    });

    const response = await POST(
      new NextRequest(BASE_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: "/admin" }),
      }),
    );
    expect(response.status).toBe(401);

    const rows = await prisma.adminAccessLog.findMany({});
    expect(rows).toHaveLength(0);
  });
});

describe("GET /api/admin/access-logs", () => {
  beforeEach(() => {
    setAdminAuthOk();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("관리자 인증을 통과하면 접속 기록을 최신순으로 반환한다", async () => {
    await recordAdminAccess({
      adminUid: "admin-a",
      ip: "203.0.113.1",
      userAgent: "UA",
      path: "/admin",
    });
    await recordAdminAccess({
      adminUid: "admin-b",
      ip: "203.0.113.2",
      userAgent: "UA",
      path: "/admin/gyms",
    });

    const response = await GET(getRequest(BASE_URL));
    const body = (await response.json()) as { accessLogs?: unknown[] };

    expect(response.status).toBe(200);
    expect(body.accessLogs).toHaveLength(2);
  });

  it("adminUid로 필터한다", async () => {
    await recordAdminAccess({
      adminUid: "admin-a",
      ip: "203.0.113.1",
      userAgent: "UA",
      path: "/admin",
    });
    await recordAdminAccess({
      adminUid: "admin-b",
      ip: "203.0.113.2",
      userAgent: "UA",
      path: "/admin",
    });

    const response = await GET(getRequest(`${BASE_URL}?adminUid=admin-a`));
    const body = (await response.json()) as {
      accessLogs?: Array<{ adminUid?: unknown }>;
    };

    expect(response.status).toBe(200);
    expect(body.accessLogs).toHaveLength(1);
    expect(body.accessLogs?.[0]?.adminUid).toBe("admin-a");
  });

  it("limit 형식이 올바르지 않으면 400을 반환한다", async () => {
    const response = await GET(getRequest(`${BASE_URL}?limit=-1`));
    expect(response.status).toBe(400);
  });

  it("접속 기록 조회 중 서버 오류가 발생하면 500을 반환한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.adminAccessLog, "findMany").mockRejectedValueOnce(
      new Error("database offline"),
    );

    const response = await GET(getRequest(BASE_URL));
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(500);
    expect(body.message).toBe("접속 기록을 불러오지 못했습니다.");
  });
});
