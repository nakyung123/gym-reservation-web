import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/admin/gyms/route";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { updateAdminGym } from "@/lib/server/db-gym-admin-repository";
import { prisma } from "@/lib/server/prisma-client";
import type { AdminGym } from "@/types/domain";
import { TEST_GYM } from "@tests/setup-db";

vi.mock("@/lib/server/admin-auth", () => ({
  verifyAdminTokenFromRequest: vi.fn(),
}));

const ADMIN_BEARER = "Bearer admin-test-id-token";

const newAdminGym: AdminGym = {
  ...TEST_GYM,
  id: "route-admin-gym",
  name: "라우트 관리자 체육관",
  isActive: true,
};

function adminRequest(url: string, bearer = ADMIN_BEARER) {
  return new NextRequest(url, {
    headers: { authorization: bearer },
  });
}

function postRequest(body: unknown, bearer = ADMIN_BEARER) {
  return new NextRequest("http://localhost:3000/api/admin/gyms", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: bearer,
    },
    body: JSON.stringify(body),
  });
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

describe("GET /api/admin/gyms", () => {
  beforeEach(() => {
    setAdminAuthOk();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("관리자 인증을 통과하면 비활성 시설까지 조회한다", async () => {
    const updated = await updateAdminGym(TEST_GYM.id, {
      ...TEST_GYM,
      isActive: false,
    });
    expect(updated.ok).toBe(true);

    const response = await GET(
      adminRequest("http://localhost:3000/api/admin/gyms"),
    );
    const body = (await response.json()) as {
      gyms?: Array<{ id?: unknown; isActive?: unknown }>;
    };

    expect(response.status).toBe(200);
    expect(body.gyms).toEqual([
      expect.objectContaining({
        id: TEST_GYM.id,
        isActive: false,
      }),
    ]);
  });

  it("Authorization 헤더가 없으면 401을 반환한다", async () => {
    setAdminAuthError(401, "관리자 인증이 필요합니다.");

    const response = await GET(
      new NextRequest("http://localhost:3000/api/admin/gyms"),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(401);
    expect(body.message).toBe("관리자 인증이 필요합니다.");
  });

  it("admin claim이 없으면 403을 반환한다", async () => {
    setAdminAuthError(403, "관리자 권한이 없습니다.");

    const response = await GET(
      adminRequest("http://localhost:3000/api/admin/gyms"),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(403);
    expect(body.message).toBe("관리자 권한이 없습니다.");
  });

  it("시설 목록 조회 중 서버 오류가 발생하면 500을 반환한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.gym, "findMany").mockRejectedValueOnce(
      new Error("database offline"),
    );

    const response = await GET(
      adminRequest("http://localhost:3000/api/admin/gyms"),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(500);
    expect(body.message).toBe("시설 목록을 불러오지 못했습니다.");
  });
});

describe("POST /api/admin/gyms", () => {
  beforeEach(() => {
    setAdminAuthOk();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("관리자 인증과 올바른 본문이 있으면 시설을 추가한다", async () => {
    const response = await POST(postRequest(newAdminGym));
    const body = (await response.json()) as {
      gym?: { id?: unknown; name?: unknown; isActive?: unknown };
      message?: unknown;
    };

    expect(response.status).toBe(200);
    expect(body.message).toBe("시설이 추가되었습니다.");
    expect(body.gym).toMatchObject({
      id: newAdminGym.id,
      name: newAdminGym.name,
      isActive: true,
    });

    const row = await prisma.gym.findUniqueOrThrow({
      where: { id: newAdminGym.id },
      include: { sports: true },
    });
    expect(row.name).toBe(newAdminGym.name);
    expect(row.sports.map((sport) => sport.sport).sort()).toEqual(
      [...newAdminGym.sports].sort(),
    );
  });

  it("시설 생성 시 audit 로그를 남긴다", async () => {
    const response = await POST(postRequest(newAdminGym));
    expect(response.status).toBe(200);

    const rows = await prisma.auditLog.findMany({
      where: { targetType: "gym", targetId: newAdminGym.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("gym.create");
    expect(rows[0]?.adminUid).toBe("admin-test-uid");
  });

  it("Authorization 헤더가 없으면 401을 반환하고 추가하지 않는다", async () => {
    setAdminAuthError(401, "관리자 인증이 필요합니다.");

    const response = await POST(
      new NextRequest("http://localhost:3000/api/admin/gyms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAdminGym),
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(401);
    expect(body.message).toBe("관리자 인증이 필요합니다.");
    expect(await prisma.gym.count()).toBe(1);
  });

  it("admin claim이 없으면 403을 반환하고 추가하지 않는다", async () => {
    setAdminAuthError(403, "관리자 권한이 없습니다.");

    const response = await POST(postRequest(newAdminGym));
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(403);
    expect(body.message).toBe("관리자 권한이 없습니다.");
    expect(await prisma.gym.count()).toBe(1);
  });

  it("요청 본문이 JSON 형식이 아니면 400을 반환한다", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/admin/gyms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: ADMIN_BEARER,
        },
        body: "{",
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("요청 본문이 JSON 형식이 아닙니다.");
    expect(await prisma.gym.count()).toBe(1);
  });

  it("지원하지 않는 종목이면 400을 반환하고 추가하지 않는다", async () => {
    const response = await POST(
      postRequest({
        ...newAdminGym,
        sports: ["축구"],
        sportPrices: { 축구: 10000 },
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("지원하지 않는 종목입니다: 축구");
    expect(await prisma.gym.count()).toBe(1);
  });

  it("중복 ID이면 409를 반환하고 추가하지 않는다", async () => {
    const response = await POST(
      postRequest({
        ...newAdminGym,
        id: TEST_GYM.id,
      }),
    );
    const body = (await response.json()) as {
      status?: unknown;
      message?: unknown;
    };

    expect(response.status).toBe(409);
    expect(body.status).toBe("duplicate");
    expect(body.message).toBe("이미 같은 ID의 시설이 있습니다.");
    expect(await prisma.gym.count()).toBe(1);
  });

  it("시설 추가 중 서버 오류가 발생하면 500을 반환한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.gym, "create").mockRejectedValueOnce(
      new Error("database offline"),
    );

    const response = await POST(postRequest(newAdminGym));
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(500);
    expect(body.message).toBe("시설을 추가하지 못했습니다.");
  });
});
