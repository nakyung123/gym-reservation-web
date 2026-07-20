import { describe, expect, it, vi } from "vitest";
import { createReservation } from "@/lib/reservation-service";
import {
  reservationsNotReady,
  type ReservationRepository,
} from "@/lib/reservation-repository";
import type { Gym, Reservation, ReservationDraft } from "@/types/domain";

const gym: Gym = {
  id: "service-test-gym",
  name: "서비스 테스트 체육관",
  region: "서울 테스트구",
  address: "테스트로 1",
  officialUrl: "https://example.com",
  openHours: "09:00-22:00",
  basePrice: 10000,
  description: "예약 서비스 테스트용",
  latitude: 37.5665,
  longitude: 126.978,
  sportPrices: { 배드민턴: 12000 },
  facilities: [],
  availableTimes: ["10:00", "11:00"],
  closedDays: [],
  sports: ["배드민턴"],
};

const draft: ReservationDraft = {
  userId: "service-user",
  gymId: gym.id,
  sport: "배드민턴",
  date: "2026-05-20",
  time: "10:00",
  price: 12000,
};

const now = new Date("2026-05-01T00:00:00+09:00");

function reservationFrom(source: ReservationDraft): Reservation {
  return {
    id: "service-built-reservation",
    userId: source.userId,
    gymId: source.gymId,
    sport: source.sport,
    date: source.date,
    time: source.time,
    price: source.price,
    status: "reserved",
    paymentMethod: null,
    phone: null,
    createdAt: "2026-05-01T00:00:00.000Z",
  };
}

/**
 * 저장소 스텁.
 *
 * read()는 기본적으로 not-ready를 돌려준다 — 예약 폼 화면처럼 목록 스냅샷을
 * 구독하는 컴포넌트가 없는 상황을 재현한다. 예약 생성은 이 상태에서도 동작해야 한다.
 */
function createRepositoryStub({
  activeInScope = [] as Reservation[],
}: { activeInScope?: Reservation[] } = {}) {
  const create = vi.fn(async (reservation: Reservation) => ({
    ok: true as const,
    status: "created" as const,
    reservation,
  }));

  const repository: ReservationRepository = {
    read: () => reservationsNotReady(),
    fetchActiveInScope: vi.fn(async () => ({
      ok: true as const,
      reservations: activeInScope,
    })),
    create,
    build: (source: ReservationDraft) => reservationFrom(source),
    cancel: vi.fn(),
    getSnapshot: () => "",
    getServerSnapshot: () => "",
    subscribe: () => () => undefined,
  } as unknown as ReservationRepository;

  return { repository, create };
}

describe("createReservation", () => {
  // 회귀 방지: 예약 폼 화면에는 목록 스냅샷 구독자가 없다. 예전 구현은 read()에
  // 의존해서 그 화면에서 항상 not-ready로 막혔다.
  it("목록 스냅샷이 채워지지 않은 상태에서도 예약을 생성한다", async () => {
    const { repository, create } = createRepositoryStub();

    const result = await createReservation({ gym, draft, now, repository });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe("created");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("판정 근거를 해당 슬롯 범위로만 조회한다", async () => {
    const { repository } = createRepositoryStub();

    await createReservation({ gym, draft, now, repository });

    expect(repository.fetchActiveInScope).toHaveBeenCalledWith({
      gymId: draft.gymId,
      sport: draft.sport,
      date: draft.date,
    });
  });

  it("같은 슬롯에 활성 예약이 있으면 서버 호출 없이 duplicate로 막는다", async () => {
    const existing = reservationFrom(draft);
    const { repository, create } = createRepositoryStub({
      activeInScope: [existing],
    });

    const result = await createReservation({ gym, draft, now, repository });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("duplicate");
    expect(create).not.toHaveBeenCalled();
  });

  it("범위 조회가 실패하면 생성하지 않고 실패 사유를 전달한다", async () => {
    const { repository, create } = createRepositoryStub();
    vi.mocked(repository.fetchActiveInScope).mockResolvedValueOnce({
      ok: false,
      reason: "remote-unavailable",
      message: "예약 정보를 불러오지 못했습니다.",
    });

    const result = await createReservation({ gym, draft, now, repository });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("rejected");
    expect(result.message).toBe("예약 정보를 불러오지 못했습니다.");
    // 판정 근거가 없으면 서버로 보내지 않는다(조용한 통과 금지).
    expect(create).not.toHaveBeenCalled();
  });
});
