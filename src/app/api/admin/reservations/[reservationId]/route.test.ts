import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH } from "@/app/api/admin/reservations/[reservationId]/route";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { createReservationInDb } from "@/lib/server/db-reservation-repository";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM, futureDate } from "@tests/setup-db";

vi.mock("@/lib/server/admin-auth", () => ({
  verifyAdminTokenFromRequest: vi.fn(),
}));

const ADMIN_BEARER = "Bearer admin-test-id-token";

function requestFor(reservationId: string, bearer = ADMIN_BEARER): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/admin/reservations/${encodeURIComponent(reservationId)}`,
    {
      headers: { authorization: bearer },
    },
  );
}

function patchRequestFor(
  reservationId: string,
  status: unknown,
  bearer = ADMIN_BEARER,
): NextRequest {
  return rawPatchRequestFor(reservationId, JSON.stringify({ status }), bearer);
}

function rawPatchRequestFor(
  reservationId: string,
  body: BodyInit,
  bearer = ADMIN_BEARER,
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/admin/reservations/${encodeURIComponent(reservationId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        authorization: bearer,
      },
      body,
    },
  );
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

function contextFor(reservationId: string) {
  return { params: Promise.resolve({ reservationId }) };
}

async function expectReservationLockToBeCleared(reservationId: string) {
  const row = await prisma.reservation.findUniqueOrThrow({
    where: { id: reservationId },
  });

  await expect(
    prisma.reservationLock.findUnique({
      where: { activeKey: row.activeKey },
    }),
  ).resolves.toBeNull();
}

async function getSlotReservedCount(input: {
  gymId: string;
  sport: "배드민턴";
  date: string;
  time: string;
}) {
  const slot = await prisma.reservationSlot.findUniqueOrThrow({
    where: { gymId_sport_date_time: input },
  });
  return slot.reservedCount;
}

describe("GET /api/admin/reservations/[reservationId]", () => {
  beforeEach(() => {
    setAdminAuthOk();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("관리자 인증이 있으면 예약 단건을 조회한다", async () => {
    const created = await createReservationInDb({
      userId: "admin-detail-user",
      draft: {
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date: futureDate(),
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const response = await GET(
      requestFor(created.reservation.id),
      contextFor(created.reservation.id),
    );
    const body = (await response.json()) as {
      reservation?: { id?: unknown; userId?: unknown };
    };

    expect(response.status).toBe(200);
    expect(body.reservation).toMatchObject({
      id: created.reservation.id,
      userId: "admin-detail-user",
    });
  });

  it("Authorization 헤더가 없으면 조회하지 않는다", async () => {
    setAdminAuthError(401, "관리자 인증이 필요합니다.");

    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/admin/reservations/missing-reservation",
      ),
      contextFor("missing-reservation"),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(401);
    expect(body.message).toBe("관리자 인증이 필요합니다.");
  });

  it("admin claim이 없으면 403을 반환한다", async () => {
    setAdminAuthError(403, "관리자 권한이 없습니다.");

    const response = await GET(
      requestFor("missing-reservation"),
      contextFor("missing-reservation"),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(403);
    expect(body.message).toBe("관리자 권한이 없습니다.");
  });

  it("존재하지 않는 예약 ID는 404를 반환한다", async () => {
    const response = await GET(
      requestFor("missing-reservation"),
      contextFor("missing-reservation"),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(404);
    expect(body.message).toBe("예약을 찾을 수 없습니다.");
  });

  it("관리자 예약 상세 조회 중 서버 오류가 발생하면 500을 반환한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.reservation, "findUnique").mockRejectedValueOnce(
      new Error("database offline"),
    );

    const response = await GET(
      requestFor("reservation-error"),
      contextFor("reservation-error"),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(500);
    expect(body.message).toBe("관리자 예약 상세를 불러오지 못했습니다.");
  });
});

describe("PATCH /api/admin/reservations/[reservationId]", () => {
  beforeEach(() => {
    setAdminAuthOk();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("관리자 인증이 있으면 예약을 이용 완료 처리한다", async () => {
    const created = await createReservationInDb({
      userId: "admin-patch-user",
      draft: {
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date: futureDate(),
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const response = await PATCH(
      patchRequestFor(created.reservation.id, "used"),
      contextFor(created.reservation.id),
    );
    const body = (await response.json()) as {
      status?: unknown;
      reservation?: { status?: unknown };
    };

    expect(response.status).toBe(200);
    expect(body.status).toBe("used");
    expect(body.reservation?.status).toBe("used");

    const row = await prisma.reservation.findUniqueOrThrow({
      where: { id: created.reservation.id },
    });
    expect(row.status).toBe("used");
    await expect(
      prisma.reservationLock.findUnique({
        where: { activeKey: row.activeKey },
      }),
    ).resolves.toBeNull();
  });

  it("지원하지 않는 상태 변경 요청은 400을 반환하고 변경하지 않는다", async () => {
    const created = await createReservationInDb({
      userId: "admin-patch-invalid-status-user",
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(9),
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const response = await PATCH(
      patchRequestFor(created.reservation.id, "reserved"),
      contextFor(created.reservation.id),
    );

    expect(response.status).toBe(400);
    const row = await prisma.reservation.findUniqueOrThrow({
      where: { id: created.reservation.id },
    });
    expect(row.status).toBe("reserved");
    await expect(
      prisma.reservationLock.findUnique({
        where: { activeKey: row.activeKey },
      }),
    ).resolves.not.toBeNull();
  });

  it("Authorization 헤더가 없으면 예약 상태를 변경하지 않는다", async () => {
    setAdminAuthError(401, "관리자 인증이 필요합니다.");

    const created = await createReservationInDb({
      userId: "admin-patch-auth-user",
      draft: {
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date: futureDate(),
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const response = await PATCH(
      new NextRequest(
        `http://localhost:3000/api/admin/reservations/${created.reservation.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "cancelled" }),
        },
      ),
      contextFor(created.reservation.id),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(401);
    expect(body.message).toBe("관리자 인증이 필요합니다.");
    const row = await prisma.reservation.findUniqueOrThrow({
      where: { id: created.reservation.id },
    });
    expect(row.status).toBe("reserved");
  });

  it("admin claim이 없으면 403을 반환하고 예약을 변경하지 않는다", async () => {
    setAdminAuthError(403, "관리자 권한이 없습니다.");

    const created = await createReservationInDb({
      userId: "admin-patch-no-claim-user",
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(10),
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const response = await PATCH(
      patchRequestFor(created.reservation.id, "used"),
      contextFor(created.reservation.id),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(403);
    expect(body.message).toBe("관리자 권한이 없습니다.");
    const row = await prisma.reservation.findUniqueOrThrow({
      where: { id: created.reservation.id },
    });
    expect(row.status).toBe("reserved");
    await expect(
      prisma.reservationLock.findUnique({
        where: { activeKey: row.activeKey },
      }),
    ).resolves.not.toBeNull();
  });

  it("malformed JSON returns 400 and keeps the reservation unchanged", async () => {
    const created = await createReservationInDb({
      userId: "admin-patch-json-user",
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(11),
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const response = await PATCH(
      rawPatchRequestFor(created.reservation.id, "{"),
      contextFor(created.reservation.id),
    );

    expect(response.status).toBe(400);
    const row = await prisma.reservation.findUniqueOrThrow({
      where: { id: created.reservation.id },
    });
    expect(row.status).toBe("reserved");
    await expect(
      prisma.reservationLock.findUnique({
        where: { activeKey: row.activeKey },
      }),
    ).resolves.not.toBeNull();
  });

  it("missing reservation returns 404", async () => {
    const response = await PATCH(
      patchRequestFor("missing-reservation", "used"),
      contextFor("missing-reservation"),
    );
    const body = (await response.json()) as { status?: unknown };

    expect(response.status).toBe(404);
    expect(body.status).toBe("not-found");
  });

  it("using an already used reservation is idempotent", async () => {
    const created = await createReservationInDb({
      userId: "admin-patch-used-repeat-user",
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(12),
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const first = await PATCH(
      patchRequestFor(created.reservation.id, "used"),
      contextFor(created.reservation.id),
    );
    const second = await PATCH(
      patchRequestFor(created.reservation.id, "used"),
      contextFor(created.reservation.id),
    );
    const secondBody = (await second.json()) as {
      status?: unknown;
      reservation?: { status?: unknown };
    };

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(secondBody.status).toBe("unchanged");
    expect(secondBody.reservation?.status).toBe("used");
    await expectReservationLockToBeCleared(created.reservation.id);
  });

  it("cancelling an already cancelled reservation is idempotent", async () => {
    const date = futureDate(13);
    const created = await createReservationInDb({
      userId: "admin-patch-cancel-repeat-user",
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date,
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await expect(
      getSlotReservedCount({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date,
        time: "10:00",
      }),
    ).resolves.toBe(1);

    const first = await PATCH(
      patchRequestFor(created.reservation.id, "cancelled"),
      contextFor(created.reservation.id),
    );
    const second = await PATCH(
      patchRequestFor(created.reservation.id, "cancelled"),
      contextFor(created.reservation.id),
    );
    const secondBody = (await second.json()) as {
      status?: unknown;
      reservation?: { status?: unknown };
    };

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(secondBody.status).toBe("unchanged");
    expect(secondBody.reservation?.status).toBe("cancelled");
    await expectReservationLockToBeCleared(created.reservation.id);
    await expect(
      getSlotReservedCount({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date,
        time: "10:00",
      }),
    ).resolves.toBe(0);
  });

  it("using a cancelled reservation returns 409 and keeps it cancelled", async () => {
    const date = futureDate(14);
    const created = await createReservationInDb({
      userId: "admin-patch-cancelled-to-used-user",
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date,
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const cancelled = await PATCH(
      patchRequestFor(created.reservation.id, "cancelled"),
      contextFor(created.reservation.id),
    );
    expect(cancelled.status).toBe(200);

    const response = await PATCH(
      patchRequestFor(created.reservation.id, "used"),
      contextFor(created.reservation.id),
    );
    const body = (await response.json()) as {
      status?: unknown;
      reservation?: { status?: unknown };
    };

    expect(response.status).toBe(409);
    expect(body.status).toBe("not-usable");
    expect(body.reservation?.status).toBe("cancelled");
    await expectReservationLockToBeCleared(created.reservation.id);
    // 거부된 used 처리가 슬롯 카운터를 재증가시키지 않는지 확인.
    // 직전 취소에서 0으로 떨어진 값이 그대로여야 한다.
    await expect(
      getSlotReservedCount({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date,
        time: "10:00",
      }),
    ).resolves.toBe(0);
  });

  it("cancelling a used reservation returns 409 and keeps it used", async () => {
    const date = futureDate(15);
    const created = await createReservationInDb({
      userId: "admin-patch-used-to-cancel-user",
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date,
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const used = await PATCH(
      patchRequestFor(created.reservation.id, "used"),
      contextFor(created.reservation.id),
    );
    expect(used.status).toBe(200);

    const response = await PATCH(
      patchRequestFor(created.reservation.id, "cancelled"),
      contextFor(created.reservation.id),
    );
    const body = (await response.json()) as {
      status?: unknown;
      reservation?: { status?: unknown };
    };

    expect(response.status).toBe(409);
    expect(body.status).toBe("not-cancellable");
    expect(body.reservation?.status).toBe("used");
    await expectReservationLockToBeCleared(created.reservation.id);
    await expect(
      getSlotReservedCount({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date,
        time: "10:00",
      }),
    ).resolves.toBe(1);
  });

  it("이용 완료/취소 처리 시 audit를 남기고 unchanged면 추가로 남기지 않는다", async () => {
    const created = await createReservationInDb({
      userId: "admin-audit-user",
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(16),
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const first = await PATCH(
      patchRequestFor(created.reservation.id, "used"),
      contextFor(created.reservation.id),
    );
    expect(first.status).toBe(200);

    const afterFirst = await prisma.auditLog.findMany({
      where: { targetType: "reservation", targetId: created.reservation.id },
    });
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]?.action).toBe("reservation.use");
    expect(afterFirst[0]?.adminUid).toBe("admin-test-uid");

    // 같은 상태 재요청(unchanged)은 audit를 추가로 남기지 않는다(중복 기록 방지).
    const second = await PATCH(
      patchRequestFor(created.reservation.id, "used"),
      contextFor(created.reservation.id),
    );
    expect(second.status).toBe(200);
    await expect(
      prisma.auditLog.count({
        where: { targetType: "reservation", targetId: created.reservation.id },
      }),
    ).resolves.toBe(1);
  });

  it("관리자 예약 상태 변경 중 서버 오류가 발생하면 500을 반환한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.reservation, "findUnique").mockRejectedValueOnce(
      new Error("database offline"),
    );

    const response = await PATCH(
      patchRequestFor("reservation-error", "used"),
      contextFor("reservation-error"),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(500);
    expect(body.message).toBe("관리자 예약 상태를 변경하지 못했습니다.");
  });
});
