import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/admin/customers/route";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { prisma } from "@/lib/server/prisma-client";

vi.mock("@/lib/server/admin-auth", () => ({
  verifyAdminTokenFromRequest: vi.fn(),
}));

const ADMIN_BEARER = "Bearer admin-test-id-token";
const BASE_URL = "http://localhost:3000/api/admin/customers";

function adminRequest(url: string, bearer = ADMIN_BEARER) {
  return new NextRequest(url, { headers: { authorization: bearer } });
}

function setAdminAuthOk() {
  vi.mocked(verifyAdminTokenFromRequest).mockResolvedValue({
    ok: true,
    uid: "admin-test-uid",
  });
}

function setAdminAuthError(status: 401 | 403, message: string) {
  vi.mocked(verifyAdminTokenFromRequest).mockResolvedValueOnce({
    ok: false,
    status,
    message,
  });
}

describe("GET /api/admin/customers", () => {
  beforeEach(() => {
    setAdminAuthOk();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("관리자 인증을 통과하면 고객 목록을 반환한다(email 미포함)", async () => {
    await prisma.userProfile.create({
      data: {
        userId: "list-cust",
        name: "목록고객",
        provider: "google",
        preferredSports: [],
      },
    });

    const response = await GET(adminRequest(BASE_URL));
    const body = (await response.json()) as {
      customers?: Array<Record<string, unknown>>;
    };

    expect(response.status).toBe(200);
    expect(body.customers).toEqual([
      expect.objectContaining({
        userId: "list-cust",
        name: "목록고객",
        provider: "google",
        reservationCount: 0,
        activeFavoriteCount: 0,
      }),
    ]);
    // 목록 행에는 PII(email)가 없어야 한다.
    expect(body.customers?.[0]).not.toHaveProperty("email");
  });

  it("q로 이름을 검색한다", async () => {
    await prisma.userProfile.create({
      data: {
        userId: "cust-x",
        name: "검색대상",
        provider: "kakao",
        preferredSports: [],
      },
    });
    await prisma.userProfile.create({
      data: {
        userId: "cust-y",
        name: "다른이름",
        provider: "kakao",
        preferredSports: [],
      },
    });

    const response = await GET(adminRequest(`${BASE_URL}?q=검색`));
    const body = (await response.json()) as {
      customers?: Array<{ userId?: unknown }>;
    };

    expect(response.status).toBe(200);
    expect(body.customers).toHaveLength(1);
    expect(body.customers?.[0]?.userId).toBe("cust-x");
  });

  it("Authorization 헤더가 없으면 401을 반환한다", async () => {
    setAdminAuthError(401, "관리자 인증이 필요합니다.");

    const response = await GET(new NextRequest(BASE_URL));
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(401);
    expect(body.message).toBe("관리자 인증이 필요합니다.");
  });

  it("admin claim이 없으면 403을 반환한다", async () => {
    setAdminAuthError(403, "관리자 권한이 없습니다.");

    const response = await GET(adminRequest(BASE_URL));
    expect(response.status).toBe(403);
  });

  it("limit 형식이 올바르지 않으면 400을 반환한다", async () => {
    const response = await GET(adminRequest(`${BASE_URL}?limit=abc`));
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("limit은 1 이상 200 이하의 정수여야 합니다.");
  });

  it("고객 목록 조회 중 서버 오류가 발생하면 500을 반환한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.userProfile, "findMany").mockRejectedValueOnce(
      new Error("database offline"),
    );

    const response = await GET(adminRequest(BASE_URL));
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(500);
    expect(body.message).toBe("고객 목록을 불러오지 못했습니다.");
  });
});
