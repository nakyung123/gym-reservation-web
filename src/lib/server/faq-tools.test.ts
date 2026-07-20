import { afterEach, describe, expect, it, vi } from "vitest";

const { listUserReservations, findById } = vi.hoisted(() => ({
  listUserReservations: vi.fn(),
  findById: vi.fn(),
}));

vi.mock("@/lib/server/db-reservation-repository", () => ({
  listUserReservations,
}));
vi.mock("@/lib/gym-repository-provider", () => ({
  gymRepository: { findById },
}));

import { FAQ_TOOLS, MAX_TOOL_CALLS, runFaqTool } from "@/lib/server/faq-tools";

function reservation(overrides: Record<string, unknown> = {}) {
  return {
    id: "faq-tool-reservation",
    userId: "owner-uid",
    gymId: "gym-1",
    sport: "배드민턴",
    date: "2026-09-10",
    time: "10:00",
    price: 12000,
    status: "reserved",
    paymentMethod: null,
    phone: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => vi.clearAllMocks());

describe("FAQ 도구 정의", () => {
  // 보안 불변식: 도구가 대상 사용자를 입력으로 받으면 프롬프트 인젝션으로
  // 타인의 예약을 조회할 수 있다. 어떤 도구도 userId류 파라미터를 노출하면 안 된다.
  it("어떤 도구도 사용자 식별자를 파라미터로 받지 않는다", () => {
    for (const tool of FAQ_TOOLS) {
      const properties = Object.keys(
        (tool.input_schema.properties ?? {}) as Record<string, unknown>,
      );
      for (const key of properties) {
        expect(key.toLowerCase()).not.toContain("userid");
        expect(key.toLowerCase()).not.toContain("uid");
      }
    }
  });

  it("조회 전용이다 — 쓰기(취소·생성) 도구가 없다", () => {
    const names = FAQ_TOOLS.map((tool) => tool.name);
    for (const name of names) {
      expect(name).not.toMatch(/cancel|create|delete|update|취소/i);
    }
    expect(names).toContain("get_my_reservations");
  });

  it("도구 호출 상한이 유한하다", () => {
    expect(MAX_TOOL_CALLS).toBeGreaterThan(0);
    expect(MAX_TOOL_CALLS).toBeLessThanOrEqual(5);
  });
});

describe("runFaqTool: get_my_reservations", () => {
  it("컨텍스트의 uid로만 조회한다 (모델 입력으로 대상을 바꿀 수 없다)", async () => {
    listUserReservations.mockResolvedValue([reservation()]);
    findById.mockResolvedValue({ id: "gym-1", name: "테스트체육관" });

    // 모델이 남의 uid를 넣으려 시도하는 상황.
    await runFaqTool(
      {
        id: "tu_1",
        name: "get_my_reservations",
        input: { userId: "someone-else", uid: "someone-else" },
      },
      { userId: "owner-uid" },
    );

    expect(listUserReservations).toHaveBeenCalledTimes(1);
    expect(listUserReservations).toHaveBeenCalledWith("owner-uid", {
      status: undefined,
    });
  });

  it("모델이 준 status가 허용값이 아니면 무시한다", async () => {
    listUserReservations.mockResolvedValue([]);

    await runFaqTool(
      { id: "tu_2", name: "get_my_reservations", input: { status: "'; DROP--" } },
      { userId: "owner-uid" },
    );

    expect(listUserReservations).toHaveBeenCalledWith("owner-uid", {
      status: undefined,
    });
  });

  it("허용된 status는 그대로 전달한다", async () => {
    listUserReservations.mockResolvedValue([]);

    await runFaqTool(
      { id: "tu_3", name: "get_my_reservations", input: { status: "reserved" } },
      { userId: "owner-uid" },
    );

    expect(listUserReservations).toHaveBeenCalledWith("owner-uid", {
      status: "reserved",
    });
  });

  it("비로그인이면 조회하지 않고 is_error로 알린다", async () => {
    const result = await runFaqTool(
      { id: "tu_4", name: "get_my_reservations", input: {} },
      { userId: null },
    );

    expect(listUserReservations).not.toHaveBeenCalled();
    expect(result.is_error).toBe(true);
    // 조용히 빈 결과를 주면 봇이 "예약이 없다"고 잘못 답한다.
    expect(String(result.content)).toContain("로그인");
  });

  it("예약이 없으면 없다고 알린다", async () => {
    listUserReservations.mockResolvedValue([]);

    const result = await runFaqTool(
      { id: "tu_5", name: "get_my_reservations", input: {} },
      { userId: "owner-uid" },
    );

    expect(result.is_error).toBeUndefined();
    expect(String(result.content)).toContain("없습니다");
  });

  it("결과 건수를 상한으로 자르고 생략 사실을 알린다", async () => {
    listUserReservations.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) =>
        reservation({ id: `r-${i}`, date: `2026-09-${10 + i}` }),
      ),
    );
    findById.mockResolvedValue({ id: "gym-1", name: "테스트체육관" });

    const result = await runFaqTool(
      { id: "tu_6", name: "get_my_reservations", input: {} },
      { userId: "owner-uid" },
    );

    const text = String(result.content);
    expect(text).toContain("총 12건");
    expect(text).toContain("생략");
    expect(text).toContain("마이페이지");
  });

  it("조회가 실패해도 throw하지 않고 is_error로 돌려준다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    listUserReservations.mockRejectedValue(new Error("db down"));

    const result = await runFaqTool(
      { id: "tu_7", name: "get_my_reservations", input: {} },
      { userId: "owner-uid" },
    );

    // 대화 전체를 끊지 않고 모델이 실패를 안내하게 한다.
    expect(result.is_error).toBe(true);
    expect(String(result.content)).toContain("조회하지 못했습니다");
  });

  it("알 수 없는 도구 이름은 is_error로 거절한다", async () => {
    const result = await runFaqTool(
      { id: "tu_8", name: "cancel_my_reservation", input: {} },
      { userId: "owner-uid" },
    );

    expect(listUserReservations).not.toHaveBeenCalled();
    expect(result.is_error).toBe(true);
  });
});
