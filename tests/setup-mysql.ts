import { afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/server/prisma-client";
import type { Gym, Sport } from "@/types/domain";

// 운영 DB로 truncate 하지 않도록 안전장치. URL에 gym_reservation_test가 없으면 즉시 실패.
if (!process.env.DATABASE_URL?.includes("gym_reservation_test")) {
  // 비밀번호가 로그에 남지 않도록 user:pass 부분만 마스킹.
  const safeUrl =
    process.env.DATABASE_URL?.replace(/\/\/[^@]+@/, "//***:***@") ??
    "(미정의)";
  throw new Error(
    `테스트 DB(gym_reservation_test) URL이 아닙니다. DATABASE_URL=${safeUrl}`,
  );
}

const testSports: Sport[] = ["배드민턴", "농구"];

export const TEST_GYM: Gym = {
  id: "gym-test-1",
  name: "테스트 체육관",
  region: "서울 테스트구",
  address: "테스트로 1",
  officialUrl: "https://example.com",
  openHours: "09:00-22:00",
  basePrice: 10000,
  description: "테스트용 체육관",
  distanceKm: 1.0,
  sportPrices: { 배드민턴: 12000, 농구: 15000 },
  facilities: ["주차장"],
  availableTimes: ["10:00", "11:00", "12:00", "14:00"],
  closedDays: [],
  sports: testSports,
};

beforeEach(async () => {
  // userProfile은 FK가 없고, 나머지는 FK 의존 순서: lock → reservation → favorite → gym_sports → gyms.
  // oauth_attempts, auth_handover_tickets는 다른 테이블과 FK 관계가 없는 독립 store.
  await prisma.oAuthAttempt.deleteMany({});
  await prisma.authHandoverTicket.deleteMany({});
  await prisma.userProfile.deleteMany({});
  await prisma.reservationLock.deleteMany({});
  await prisma.reservation.deleteMany({});
  await prisma.reservationSlot.deleteMany({});
  await prisma.favorite.deleteMany({});
  await prisma.gymSport.deleteMany({});
  await prisma.gym.deleteMany({});

  await prisma.gym.create({
    data: {
      id: TEST_GYM.id,
      name: TEST_GYM.name,
      region: TEST_GYM.region,
      address: TEST_GYM.address,
      officialUrl: TEST_GYM.officialUrl,
      openHours: TEST_GYM.openHours,
      basePrice: TEST_GYM.basePrice,
      description: TEST_GYM.description,
      distanceKm: TEST_GYM.distanceKm,
      sportPrices: TEST_GYM.sportPrices,
      facilities: TEST_GYM.facilities,
      availableTimes: TEST_GYM.availableTimes,
      closedDays: TEST_GYM.closedDays,
      sports: {
        create: TEST_GYM.sports.map((sport) => ({ sport })),
      },
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

// 테스트 헬퍼: 항상 미래 날짜를 만들어 reservation-rules의 past-time 검증을 통과.
export function futureDate(daysAhead = 7): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
