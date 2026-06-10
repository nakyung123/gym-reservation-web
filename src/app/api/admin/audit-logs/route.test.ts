import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/admin/audit-logs/route";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { recordAuditLog } from "@/lib/server/db-audit-repository";
import { prisma } from "@/lib/server/prisma-client";

vi.mock("@/lib/server/admin-auth", () => ({
  verifyAdminTokenFromRequest: vi.fn(),
}));

const ADMIN_BEARER = "Bearer admin-test-id-token";
const BASE_URL = "http://localhost:3000/api/admin/audit-logs";

function adminRequest(url: string, bearer = ADMIN_BEARER) {
  return new NextRequest(url, { headers: { authorization: bearer } });
}

function setAdminAuthOk() {
  vi.mocked(verifyAdminTokenFromRequest).mockResolvedValue({
    ok: true,
    uid: "admin-test-uid",
  });
}

async function seedAuditLogs() {
  await recordAuditLog({
    adminUid: "admin-a",
    action: "gym.create",
    targetType: "gym",
    targetId: "gym-1",
    summary: "시설 생성",
  });
  await recordAuditLog({
    adminUid: "admin-b",
    action: "reservation.cancel",
    targetType: "reservation",
    targetId: "res-1",
    summary: "예약 취소",
  });
}

describe("GET /api/admin/audit-logs", () => {
  beforeEach(() => {
    setAdminAuthOk();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("관리자 인증을 통과하면 운영 이력을 반환한다", async () => {
    await seedAuditLogs();

    const response = await GET(adminRequest(BASE_URL));
    const body = (await response.json()) as { auditLogs?: unknown[] };

    expect(response.status).toBe(200);
    expect(body.auditLogs).toHaveLength(2);
  });

  it("targetType으로 필터한다", async () => {
    await seedAuditLogs();

    const response = await GET(adminRequest(`${BASE_URL}?targetType=gym`));
    const body = (await response.json()) as {
      auditLogs?: Array<{ targetType?: unknown }>;
    };

    expect(response.status).toBe(200);
    expect(body.auditLogs).toHaveLength(1);
    expect(body.auditLogs?.[0]?.targetType).toBe("gym");
  });

  it("limit 형식이 올바르지 않으면 400을 반환한다", async () => {
    const response = await GET(adminRequest(`${BASE_URL}?limit=-1`));
    expect(response.status).toBe(400);
  });

  it("Authorization 헤더가 없으면 401을 반환한다", async () => {
    vi.mocked(verifyAdminTokenFromRequest).mockResolvedValueOnce({
      ok: false,
      status: 401,
      message: "관리자 인증이 필요합니다.",
    });

    const response = await GET(new NextRequest(BASE_URL));
    expect(response.status).toBe(401);
  });

  it("운영 이력 조회 중 서버 오류가 발생하면 500을 반환한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.auditLog, "findMany").mockRejectedValueOnce(
      new Error("database offline"),
    );

    const response = await GET(adminRequest(BASE_URL));
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(500);
    expect(body.message).toBe("운영 이력을 불러오지 못했습니다.");
  });
});
