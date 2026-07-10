import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/reservations/route";
import { updateAdminGym } from "@/lib/server/db-gym-admin-repository";
import { createReservationInDb } from "@/lib/server/db-reservation-repository";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM, futureDate } from "@tests/setup-db";

const { verifyIdToken, notifyReservationEvent } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  notifyReservationEvent: vi.fn(),
}));

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
}));

vi.mock("@/lib/server/reservation-notify", () => ({ notifyReservationEvent }));

// after()를 즉시 실행으로 대체 → 응답 후 콜백(알림)을 테스트에서 동기로 관찰한다.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (fn: () => unknown) => {
      void fn();
    },
  };
});

function authHeaders(idToken = "test-id-token") {
  return { Authorization: `Bearer ${idToken}` };
}

function getRequest(idToken = "test-id-token") {
  return new NextRequest("http://localhost:3000/api/reservations", {
    headers: authHeaders(idToken),
  });
}

function postRequest(body: unknown, idToken = "test-id-token") {
  return new NextRequest("http://localhost:3000/api/reservations", {
    method: "POST",
    headers: {
      ...authHeaders(idToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("GET /api/reservations", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("로그인한 사용자의 예약만 반환한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "route-user-a" });
    const date = futureDate();
    const own = await createReservationInDb({
      userId: "route-user-a",
      draft: {
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date,
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    const other = await createReservationInDb({
      userId: "route-user-b",
      draft: {
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date,
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    expect(own.ok).toBe(true);
    expect(other.ok).toBe(true);
    if (!own.ok || !other.ok) return;

    const response = await GET(getRequest());
    const body = (await response.json()) as {
      reservations?: Array<{ id?: unknown; userId?: unknown }>;
    };

    expect(response.status).toBe(200);
    expect(body.reservations).toEqual([
      expect.objectContaining({
        id: own.reservation.id,
        userId: "route-user-a",
      }),
    ]);
  });

  it("Authorization 헤더가 없으면 401을 반환한다", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/api/reservations"),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(401);
    expect(body.message).toEqual(expect.any(String));
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("ID 토큰 검증에 실패하면 401을 반환한다", async () => {
    verifyIdToken.mockRejectedValue(new Error("expired token"));

    const response = await GET(getRequest());
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(401);
    expect(body.message).toBe("ID 토큰 검증에 실패했습니다.");
  });

  it("예약 목록 조회 중 서버 오류가 발생하면 500을 반환한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "list-error-route-user" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.reservation, "findMany").mockRejectedValueOnce(
      new Error("database offline"),
    );

    const response = await GET(getRequest());
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(500);
    expect(body.message).toBe("예약 목록을 불러오지 못했습니다.");
  });
});

describe("POST /api/reservations", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
    notifyReservationEvent.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("올바른 요청이면 예약을 생성하고 슬롯 카운터를 증가시킨다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "create-route-user" });
    const date = futureDate();

    const response = await POST(
      postRequest({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date,
        time: "10:00",
      }),
    );
    const body = (await response.json()) as {
      status?: unknown;
      reservation?: { userId?: unknown; gymId?: unknown; price?: unknown };
    };

    expect(response.status).toBe(201);
    expect(body.status).toBe("created");
    expect(body.reservation).toMatchObject({
      userId: "create-route-user",
      gymId: TEST_GYM.id,
      price: 12000,
    });
    // 생성 성공 시 즉시 알림이 슬롯 정보로 호출된다(PII 없이).
    expect(notifyReservationEvent).toHaveBeenCalledWith({
      kind: "created",
      gymName: TEST_GYM.name,
      sport: "배드민턴",
      date,
      time: "10:00",
    });

    const slot = await prisma.reservationSlot.findUniqueOrThrow({
      where: {
        gymId_sport_date_time: {
          gymId: TEST_GYM.id,
          sport: "배드민턴",
          date,
          time: "10:00",
        },
      },
    });
    expect(slot.reservedCount).toBe(1);
  });

  it("요청 본문에 price가 있어도 서버 기준 sport 가격으로 예약 금액을 저장한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "server-price-user" });
    const date = futureDate(1);

    const response = await POST(
      postRequest({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date,
        time: "11:00",
        price: 1,
      }),
    );
    const body = (await response.json()) as {
      reservation?: { id?: unknown; price?: unknown };
    };

    expect(response.status).toBe(201);
    expect(body.reservation?.price).toBe(12000);

    const stored = await prisma.reservation.findUniqueOrThrow({
      where: { id: String(body.reservation?.id) },
    });
    expect(stored.price).toBe(12000);
  });

  it("people을 보내면 저장가 = 단가 × 인원으로 합산 저장된다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "people-route-user" });
    const date = futureDate(2);

    const response = await POST(
      postRequest({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date,
        time: "11:00",
        people: 3,
      }),
    );
    const body = (await response.json()) as {
      reservation?: { id?: unknown; price?: unknown };
    };

    expect(response.status).toBe(201);
    // 배드민턴 단가 12000 × 3명
    expect(body.reservation?.price).toBe(36000);

    const stored = await prisma.reservation.findUniqueOrThrow({
      where: { id: String(body.reservation?.id) },
    });
    expect(stored.price).toBe(36000);
  });

  it("phone을 보내면 이 예약 건의 연락처로 저장된다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "phone-route-user" });
    const date = futureDate(4);

    const response = await POST(
      postRequest({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date,
        time: "12:00",
        phone: "010-1234-5678",
      }),
    );
    const body = (await response.json()) as {
      reservation?: { id?: unknown; phone?: unknown };
    };

    expect(response.status).toBe(201);
    expect(body.reservation?.phone).toBe("010-1234-5678");

    const stored = await prisma.reservation.findUniqueOrThrow({
      where: { id: String(body.reservation?.id) },
    });
    expect(stored.phone).toBe("010-1234-5678");
  });

  it("phone 미전송 시 null로 저장된다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "phone-null-route-user" });
    const date = futureDate(4);

    const response = await POST(
      postRequest({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date,
        time: "14:00",
      }),
    );
    const body = (await response.json()) as {
      reservation?: { id?: unknown; phone?: unknown };
    };

    expect(response.status).toBe(201);
    expect(body.reservation?.phone).toBeNull();

    const stored = await prisma.reservation.findUniqueOrThrow({
      where: { id: String(body.reservation?.id) },
    });
    expect(stored.phone).toBeNull();
  });

  it("형식이 잘못된 phone은 400으로 거부하고 예약을 만들지 않는다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "phone-invalid-route-user" });

    const response = await POST(
      postRequest({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date: futureDate(4),
        time: "12:00",
        phone: "abc-123",
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe(
      "연락처는 숫자와 하이픈(-)만, 숫자 9자리 이상이어야 합니다.",
    );
    expect(await prisma.reservation.count()).toBe(0);
    expect(await prisma.reservationLock.count()).toBe(0);
  });

  it("정원을 초과한 people은 422 rejected로 응답하고 예약을 만들지 않는다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "people-over-route-user" });
    const date = futureDate(3);

    const response = await POST(
      postRequest({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date,
        time: "12:00",
        people: 5,
      }),
    );
    const body = (await response.json()) as { status?: unknown };

    expect(response.status).toBe(422);
    expect(body.status).toBe("rejected");
    expect(await prisma.reservation.count()).toBe(0);
  });

  it("people이 number가 아니면 400으로 거부한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "people-bad-route-user" });
    const date = futureDate(4);

    const response = await POST(
      postRequest({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date,
        time: "13:00",
        people: "3",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("같은 사용자의 같은 활성 예약은 409 duplicate로 응답하고 슬롯을 다시 늘리지 않는다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "duplicate-route-user" });
    const date = futureDate();
    const body = {
      gymId: TEST_GYM.id,
      sport: "배드민턴",
      date,
      time: "10:00",
    };

    const firstResponse = await POST(postRequest(body));
    const secondResponse = await POST(postRequest(body));
    const secondBody = (await secondResponse.json()) as {
      status?: unknown;
      reservation?: { userId?: unknown };
    };

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(409);
    expect(secondBody.status).toBe("duplicate");
    expect(secondBody.reservation).toMatchObject({
      userId: "duplicate-route-user",
    });
    // 첫 생성만 알림. duplicate(409)는 새 예약이 아니므로 알림이 추가로 가지 않는다.
    expect(notifyReservationEvent).toHaveBeenCalledTimes(1);

    const slot = await prisma.reservationSlot.findUniqueOrThrow({
      where: {
        gymId_sport_date_time: {
          gymId: TEST_GYM.id,
          sport: "배드민턴",
          date,
          time: "10:00",
        },
      },
    });
    expect(slot.reservedCount).toBe(1);
  });

  it("정원이 가득 찬 슬롯이면 409 full로 응답한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "full-route-user-e" });
    const date = futureDate();
    const draft = {
      gymId: TEST_GYM.id,
      sport: "배드민턴" as const,
      date,
      time: "10:00",
    };

    for (const userId of [
      "full-route-user-a",
      "full-route-user-b",
      "full-route-user-c",
      "full-route-user-d",
    ]) {
      const created = await createReservationInDb({
        userId,
        draft,
        gym: TEST_GYM,
      });
      expect(created.ok).toBe(true);
    }

    const response = await POST(postRequest(draft));
    const body = (await response.json()) as {
      status?: unknown;
      slot?: { status?: unknown; remaining?: unknown };
    };

    expect(response.status).toBe(409);
    expect(body.status).toBe("full");
    expect(body.slot).toMatchObject({
      status: "full",
      remaining: 0,
    });
  });

  it("본문 형식이 올바르지 않으면 400을 반환하고 예약을 만들지 않는다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "invalid-body-route-user" });

    const response = await POST(
      postRequest({
        gymId: TEST_GYM.id,
        sport: "축구",
        date: futureDate(),
        time: "10:00",
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("요청 본문이 올바르지 않습니다.");
    expect(await prisma.reservation.count()).toBe(0);
  });

  it("malformed JSON returns 400 and does not create a reservation", async () => {
    verifyIdToken.mockResolvedValue({ uid: "malformed-json-route-user" });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/reservations", {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: "{invalid-json",
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("요청 본문이 JSON 형식이 아닙니다.");
    expect(await prisma.reservation.count()).toBe(0);
    expect(await prisma.reservationLock.count()).toBe(0);
  });

  it("체육관이 없으면 404를 반환하고 예약을 만들지 않는다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "missing-gym-route-user" });

    const response = await POST(
      postRequest({
        gymId: "missing-gym",
        sport: "배드민턴",
        date: futureDate(),
        time: "10:00",
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(404);
    expect(body.message).toBe("체육관 정보를 찾을 수 없습니다.");
    expect(await prisma.reservation.count()).toBe(0);
  });

  it("비활성 체육관이면 404를 반환하고 예약을 만들지 않는다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "inactive-gym-route-user" });
    const updated = await updateAdminGym(TEST_GYM.id, {
      ...TEST_GYM,
      isActive: false,
    });
    expect(updated.ok).toBe(true);

    const response = await POST(
      postRequest({
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(),
        time: "10:00",
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(404);
    expect(body.message).toBe("체육관 정보를 찾을 수 없습니다.");
    expect(await prisma.reservation.count()).toBe(0);
    expect(await prisma.reservationLock.count()).toBe(0);
  });

  it("존재하지 않는 날짜면 422를 반환하고 예약을 만들지 않는다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "invalid-date-route-user" });

    const response = await POST(
      postRequest({
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: "2026-02-30",
        time: "10:00",
      }),
    );
    const body = (await response.json()) as {
      status?: unknown;
      message?: unknown;
    };

    expect(response.status).toBe(422);
    expect(body.status).toBe("rejected");
    expect(body.message).toBe(
      "예약 날짜 또는 시간 형식이 올바르지 않습니다.",
    );
    expect(await prisma.reservation.count()).toBe(0);
    expect(await prisma.reservationLock.count()).toBe(0);
  });

  it("체육관이 지원하지 않는 종목이면 422를 반환하고 예약을 만들지 않는다", async () => {
    // TEST_GYM은 배드민턴/농구만 지원하므로 "풋살"은 유효한 Sport지만
    // 해당 체육관 정책상 거부되어 sport-unavailable 분기로 들어가야 한다.
    verifyIdToken.mockResolvedValue({ uid: "sport-unavailable-route-user" });

    const response = await POST(
      postRequest({
        gymId: TEST_GYM.id,
        sport: "풋살",
        date: futureDate(),
        time: "10:00",
      }),
    );
    const body = (await response.json()) as {
      status?: unknown;
      message?: unknown;
    };

    expect(response.status).toBe(422);
    expect(body.status).toBe("rejected");
    expect(body.message).toBe(
      "선택한 종목은 이 체육관에서 예약할 수 없습니다.",
    );
    expect(await prisma.reservation.count()).toBe(0);
    expect(await prisma.reservationLock.count()).toBe(0);
  });

  it("체육관 운영시간에 없는 시간대면 422를 반환하고 예약을 만들지 않는다", async () => {
    // TEST_GYM.availableTimes = [10:00, 11:00, 12:00, 14:00]
    // 13:00은 형식은 정상이지만 운영시간이 아니라 time-unavailable 분기로 가야 한다.
    verifyIdToken.mockResolvedValue({ uid: "time-unavailable-route-user" });

    const response = await POST(
      postRequest({
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(),
        time: "13:00",
      }),
    );
    const body = (await response.json()) as {
      status?: unknown;
      message?: unknown;
    };

    expect(response.status).toBe(422);
    expect(body.status).toBe("rejected");
    expect(body.message).toBe(
      "선택한 시간은 이 체육관에서 예약할 수 없습니다.",
    );
    expect(await prisma.reservation.count()).toBe(0);
    expect(await prisma.reservationLock.count()).toBe(0);
  });

  it("ID 토큰 검증에 실패하면 401을 반환하고 예약을 만들지 않는다", async () => {
    verifyIdToken.mockRejectedValue(new Error("expired token"));

    const response = await POST(
      postRequest({
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(),
        time: "10:00",
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(401);
    expect(body.message).toBe("ID 토큰 검증에 실패했습니다.");
    expect(await prisma.reservation.count()).toBe(0);
    expect(await prisma.reservationLock.count()).toBe(0);
  });

  it("Authorization 헤더가 없으면 401을 반환하고 본문을 처리하지 않는다", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gymId: TEST_GYM.id,
          sport: "배드민턴",
          date: futureDate(),
          time: "10:00",
        }),
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(401);
    expect(body.message).toEqual(expect.any(String));
    expect(verifyIdToken).not.toHaveBeenCalled();
    expect(await prisma.reservation.count()).toBe(0);
  });

  it("예약 생성 중 서버 오류가 발생하면 500을 반환한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "create-error-route-user" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.reservation, "findMany").mockRejectedValueOnce(
      new Error("database offline"),
    );

    const response = await POST(
      postRequest({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date: futureDate(),
        time: "10:00",
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(500);
    expect(body.message).toBe("예약 요청을 처리하지 못했습니다.");
  });
});
