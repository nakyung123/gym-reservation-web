import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/admin/customers/[userId]/route";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { createReservationInDb } from "@/lib/server/db-reservation-repository";
import { createUserNote } from "@/lib/server/db-user-note-repository";
import { getFirebaseUserMeta } from "@/lib/server/firebase-user-lookup";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM, futureDate } from "@tests/setup-db";

vi.mock("@/lib/server/admin-auth", () => ({
  verifyAdminTokenFromRequest: vi.fn(),
}));
vi.mock("@/lib/server/firebase-user-lookup", () => ({
  getFirebaseUserMeta: vi.fn(),
}));

const ADMIN_BEARER = "Bearer admin-test-id-token";

function adminRequest(userId: string, bearer = ADMIN_BEARER) {
  return new NextRequest(
    `http://localhost:3000/api/admin/customers/${encodeURIComponent(userId)}`,
    { headers: { authorization: bearer } },
  );
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

const FIREBASE_META = {
  email: "customer@example.com",
  emailVerified: true,
  disabled: false,
  creationTime: "2026-01-01T00:00:00.000Z",
  lastSignInTime: "2026-06-01T00:00:00.000Z",
  providers: ["password"],
};

describe("GET /api/admin/customers/[userId]", () => {
  beforeEach(() => {
    setAdminAuthOk();
    vi.mocked(getFirebaseUserMeta).mockResolvedValue({ ...FIREBASE_META });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("프로필+예약 집계+Firebase 메타+메모를 합쳐 상세를 반환한다", async () => {
    await prisma.userProfile.create({
      data: {
        userId: "detail-route-user",
        nickname: "상세고객",
        provider: "naver",
        preferredSports: [],
      },
    });
    const created = await createReservationInDb({
      userId: "detail-route-user",
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(),
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    await createUserNote({
      userId: "detail-route-user",
      adminUid: "admin-test-uid",
      body: "테스트 메모",
    });

    const response = await GET(
      adminRequest("detail-route-user"),
      contextFor("detail-route-user"),
    );
    const body = (await response.json()) as {
      detail?: {
        profile?: { nickname?: unknown };
        reservations?: { total?: unknown };
        firebase?: { email?: unknown };
        firebaseError?: unknown;
      };
      notes?: unknown[];
    };

    expect(response.status).toBe(200);
    expect(body.detail?.profile?.nickname).toBe("상세고객");
    expect(body.detail?.reservations?.total).toBe(1);
    expect(body.detail?.firebase?.email).toBe("customer@example.com");
    expect(body.detail?.firebaseError).toBe(false);
    expect(body.notes).toHaveLength(1);
  });

  it("Firebase 조회가 실패하면 firebaseError=true로 표면화하고 상세는 반환한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getFirebaseUserMeta).mockRejectedValueOnce(
      new Error("firebase down"),
    );
    await prisma.userProfile.create({
      data: {
        userId: "fb-error-user",
        nickname: "파이어",
        provider: "google",
        preferredSports: [],
      },
    });

    const response = await GET(
      adminRequest("fb-error-user"),
      contextFor("fb-error-user"),
    );
    const body = (await response.json()) as {
      detail?: { firebase?: unknown; firebaseError?: unknown };
    };

    expect(response.status).toBe(200);
    expect(body.detail?.firebase).toBeNull();
    expect(body.detail?.firebaseError).toBe(true);
  });

  it("어디에도 흔적이 없고 Firebase에도 없으면 404를 반환한다", async () => {
    vi.mocked(getFirebaseUserMeta).mockResolvedValue(null);

    const response = await GET(
      adminRequest("ghost-user"),
      contextFor("ghost-user"),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(404);
    expect(body.message).toBe("고객을 찾을 수 없습니다.");
  });

  it("프로필이 없어도 예약 이력이 있으면 상세를 반환한다", async () => {
    vi.mocked(getFirebaseUserMeta).mockResolvedValue(null);
    const created = await createReservationInDb({
      userId: "no-profile-detail",
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(),
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);

    const response = await GET(
      adminRequest("no-profile-detail"),
      contextFor("no-profile-detail"),
    );
    const body = (await response.json()) as {
      detail?: { profile?: unknown; reservations?: { total?: unknown } };
    };

    expect(response.status).toBe(200);
    expect(body.detail?.profile).toBeNull();
    expect(body.detail?.reservations?.total).toBe(1);
  });

  it("admin claim이 없으면 403을 반환한다", async () => {
    vi.mocked(verifyAdminTokenFromRequest).mockResolvedValueOnce({
      ok: false,
      status: 403,
      message: "관리자 권한이 없습니다.",
    });

    const response = await GET(
      adminRequest("any-user"),
      contextFor("any-user"),
    );
    expect(response.status).toBe(403);
  });
});
