import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/admin/gyms/route";
import { updateAdminGym } from "@/lib/server/mysql-gym-admin-repository";
import { prisma } from "@/lib/server/prisma-client";
import type { AdminGym } from "@/types/domain";
import { TEST_GYM } from "@tests/setup-mysql";

const adminToken = "test-admin-token";

const newAdminGym: AdminGym = {
  ...TEST_GYM,
  id: "route-admin-gym",
  name: "라우트 관리자 체육관",
  isActive: true,
};

function adminRequest(url: string, token = adminToken) {
  return new NextRequest(url, {
    headers: { "x-admin-token": token },
  });
}

function postRequest(body: unknown, token = adminToken) {
  return new NextRequest("http://localhost:3000/api/admin/gyms", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": token,
    },
    body: JSON.stringify(body),
  });
}

describe("GET /api/admin/gyms", () => {
  beforeEach(() => {
    process.env.ADMIN_API_TOKEN = adminToken;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("관리자 토큰이 있으면 비활성 시설까지 조회한다", async () => {
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

  it("관리자 토큰이 없으면 401을 반환한다", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/api/admin/gyms"),
    );

    expect(response.status).toBe(401);
  });

  it("관리자 토큰이 틀리면 403을 반환한다", async () => {
    const response = await GET(
      adminRequest("http://localhost:3000/api/admin/gyms", "wrong-token"),
    );

    expect(response.status).toBe(403);
  });

  it("returns 503 when the admin token is not configured", async () => {
    delete process.env.ADMIN_API_TOKEN;

    const response = await GET(
      adminRequest("http://localhost:3000/api/admin/gyms"),
    );

    expect(response.status).toBe(503);
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
    process.env.ADMIN_API_TOKEN = adminToken;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("관리자 토큰과 올바른 본문이 있으면 시설을 추가한다", async () => {
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

  it("관리자 토큰이 없으면 401을 반환하고 추가하지 않는다", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/admin/gyms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAdminGym),
      }),
    );

    expect(response.status).toBe(401);
    expect(await prisma.gym.count()).toBe(1);
  });

  it("returns 403 and does not create a gym when the admin token is wrong", async () => {
    const response = await POST(postRequest(newAdminGym, "wrong-token"));

    expect(response.status).toBe(403);
    expect(await prisma.gym.count()).toBe(1);
  });

  it("요청 본문이 JSON 형식이 아니면 400을 반환한다", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/admin/gyms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": adminToken,
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

  it("관리자 토큰이 설정되지 않았으면 503을 반환한다", async () => {
    delete process.env.ADMIN_API_TOKEN;

    const response = await POST(postRequest(newAdminGym));
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(503);
    expect(body.message).toBe("관리자 API 토큰이 설정되어 있지 않습니다.");
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
