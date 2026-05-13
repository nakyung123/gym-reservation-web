import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { GET, PATCH } from "@/app/api/admin/reservations/[reservationId]/route";
import { createReservationInMysql } from "@/lib/server/mysql-reservation-repository";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM, futureDate } from "@tests/setup-mysql";

const adminToken = "test-admin-token";

function requestFor(reservationId: string, token = adminToken): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/admin/reservations/${encodeURIComponent(reservationId)}`,
    {
      headers: { "x-admin-token": token },
    },
  );
}

function patchRequestFor(
  reservationId: string,
  status: unknown,
  token = adminToken,
): NextRequest {
  return rawPatchRequestFor(reservationId, JSON.stringify({ status }), token);
}

function rawPatchRequestFor(
  reservationId: string,
  body: BodyInit,
  token = adminToken,
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/admin/reservations/${encodeURIComponent(reservationId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": token,
      },
      body,
    },
  );
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

describe("GET /api/admin/reservations/[reservationId]", () => {
  beforeEach(() => {
    process.env.ADMIN_API_TOKEN = adminToken;
  });

  it("관리자 토큰이 있으면 예약 단건을 조회한다", async () => {
    const created = await createReservationInMysql({
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

  it("관리자 토큰이 없으면 조회하지 않는다", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/admin/reservations/missing-reservation",
      ),
      contextFor("missing-reservation"),
    );

    expect(response.status).toBe(401);
  });

  it("returns 503 when the admin token is not configured", async () => {
    delete process.env.ADMIN_API_TOKEN;

    const response = await GET(
      requestFor("missing-reservation"),
      contextFor("missing-reservation"),
    );

    expect(response.status).toBe(503);
  });

  it("관리자 토큰이 틀리면 403을 반환한다", async () => {
    const response = await GET(
      requestFor("missing-reservation", "wrong-token"),
      contextFor("missing-reservation"),
    );

    expect(response.status).toBe(403);
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
});

describe("PATCH /api/admin/reservations/[reservationId]", () => {
  beforeEach(() => {
    process.env.ADMIN_API_TOKEN = adminToken;
  });

  it("관리자 토큰이 있으면 예약을 이용 완료 처리한다", async () => {
    const created = await createReservationInMysql({
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
    const created = await createReservationInMysql({
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

  it("관리자 토큰이 없으면 예약 상태를 변경하지 않는다", async () => {
    const created = await createReservationInMysql({
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

    expect(response.status).toBe(401);
    const row = await prisma.reservation.findUniqueOrThrow({
      where: { id: created.reservation.id },
    });
    expect(row.status).toBe("reserved");
  });

  it("wrong admin token returns 403 and keeps the reservation unchanged", async () => {
    const created = await createReservationInMysql({
      userId: "admin-patch-wrong-token-user",
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
      patchRequestFor(created.reservation.id, "used", "wrong-token"),
      contextFor(created.reservation.id),
    );

    expect(response.status).toBe(403);
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

  it("returns 503 and keeps the reservation unchanged when the admin token is not configured", async () => {
    delete process.env.ADMIN_API_TOKEN;
    const created = await createReservationInMysql({
      userId: "admin-patch-missing-config-user",
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

    const response = await PATCH(
      patchRequestFor(created.reservation.id, "used"),
      contextFor(created.reservation.id),
    );

    expect(response.status).toBe(503);
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
    const created = await createReservationInMysql({
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
    const created = await createReservationInMysql({
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
    const created = await createReservationInMysql({
      userId: "admin-patch-cancel-repeat-user",
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(13),
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

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
  });

  it("using a cancelled reservation returns 409 and keeps it cancelled", async () => {
    const created = await createReservationInMysql({
      userId: "admin-patch-cancelled-to-used-user",
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(14),
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
  });

  it("cancelling a used reservation returns 409 and keeps it used", async () => {
    const created = await createReservationInMysql({
      userId: "admin-patch-used-to-cancel-user",
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(15),
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
  });
});
