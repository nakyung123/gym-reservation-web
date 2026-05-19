import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/me/withdraw/route";
import { createReservationInMysql } from "@/lib/server/mysql-reservation-repository";
import { ensureUserProfile } from "@/lib/server/mysql-user-profile-repository";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM, futureDate } from "@tests/setup-db";

const { verifyIdToken, deleteUser } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({ verifyIdToken, deleteUser }),
}));

function makeAuthError(code: string) {
  const error = new Error(code) as Error & { code?: string };
  error.code = code;
  return error;
}

function requestFor(
  body: unknown,
  { idToken = "test-id-token" }: { idToken?: string } = {},
) {
  return new NextRequest("http://localhost:3000/api/me/withdraw", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function requestRawBody(rawBody: string) {
  return new NextRequest("http://localhost:3000/api/me/withdraw", {
    method: "POST",
    headers: {
      Authorization: "Bearer test-id-token",
      "Content-Type": "application/json",
    },
    body: rawBody,
  });
}

describe("POST /api/me/withdraw", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
    deleteUser.mockReset();
  });

  it("Authorization 헤더가 없으면 401을 반환하고 service를 호출하지 않는다", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/me/withdraw", {
        method: "POST",
        body: JSON.stringify({ category: "기타", detail: null }),
      }),
    );
    expect(response.status).toBe(401);
    expect(verifyIdToken).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("JSON 본문 파싱 실패는 400을 반환한다", async () => {
    verifyIdToken.mockResolvedValue({
      uid: "withdraw-route-bad-json",
      firebase: { sign_in_provider: "password" },
    });

    const response = await POST(requestRawBody("not-json"));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { message?: unknown };
    expect(body.message).toBe("요청 본문이 JSON 형식이 아닙니다.");
  });

  it("validation 실패는 400을 반환한다", async () => {
    verifyIdToken.mockResolvedValue({
      uid: "withdraw-route-bad-input",
      firebase: { sign_in_provider: "password" },
    });

    const response = await POST(
      requestFor({ category: "잘못된카테고리", detail: null }),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { message?: unknown };
    expect(body.message).toBe("탈퇴 사유를 선택해 주세요.");
  });

  it("진행 중 예약이 있으면 409와 active-reservation reason을 반환한다", async () => {
    const userId = "withdraw-route-active";
    verifyIdToken.mockResolvedValue({
      uid: userId,
      firebase: { sign_in_provider: "password" },
    });
    const created = await createReservationInMysql({
      userId,
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(),
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);

    const response = await POST(
      requestFor({ category: "기타", detail: null }),
    );
    expect(response.status).toBe(409);
    const body = (await response.json()) as {
      reason?: unknown;
      message?: unknown;
    };
    expect(body.reason).toBe("active-reservation");
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("Auth delete 실패는 502와 auth-delete-failed reason을 반환한다", async () => {
    const userId = "withdraw-route-auth-fail";
    verifyIdToken.mockResolvedValue({
      uid: userId,
      firebase: { sign_in_provider: "password" },
    });
    await ensureUserProfile(userId, "local");
    deleteUser.mockRejectedValue(makeAuthError("auth/internal-error"));

    const response = await POST(
      requestFor({ category: "개인정보", detail: null }),
    );
    expect(response.status).toBe(502);
    const body = (await response.json()) as { reason?: unknown };
    expect(body.reason).toBe("auth-delete-failed");
    // DB는 이미 정리됨.
    await expect(
      prisma.userProfile.count({ where: { userId } }),
    ).resolves.toBe(0);
  });

  it("정상 흐름은 200을 반환하고 DB/Auth/사유 기록을 마친다", async () => {
    const userId = "withdraw-route-success";
    verifyIdToken.mockResolvedValue({
      uid: userId,
      firebase: { sign_in_provider: "password" },
    });
    await ensureUserProfile(userId, "local");
    deleteUser.mockResolvedValue(undefined);

    const response = await POST(
      requestFor({ category: "기타", detail: "마무리 정리" }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { message?: unknown };
    expect(body.message).toBe("회원 탈퇴가 완료되었습니다.");

    expect(deleteUser).toHaveBeenCalledExactlyOnceWith(userId);
    await expect(
      prisma.userProfile.count({ where: { userId } }),
    ).resolves.toBe(0);
    const reasons = await prisma.withdrawalReason.findMany();
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatchObject({
      category: "기타",
      detail: "마무리 정리",
    });
  });

  it("service의 기타 error는 500으로 응답한다", async () => {
    const userId = "withdraw-route-db-error";
    verifyIdToken.mockResolvedValue({
      uid: userId,
      firebase: { sign_in_provider: "password" },
    });

    const txSpy = vi
      .spyOn(prisma, "$transaction")
      .mockRejectedValueOnce(new Error("database offline"));

    try {
      const response = await POST(
        requestFor({ category: "기타", detail: null }),
      );
      expect(response.status).toBe(500);
      const body = (await response.json()) as { message?: unknown };
      expect(body.message).toEqual(
        expect.stringContaining("회원 정보 삭제에 실패"),
      );
      expect(deleteUser).not.toHaveBeenCalled();
    } finally {
      txSpy.mockRestore();
    }
  });
});
