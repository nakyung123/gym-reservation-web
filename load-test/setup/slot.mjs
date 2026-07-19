// 부하 테스트 대상 슬롯 준비 / 정합성 검증 / 정리.
//
//   node load-test/setup/slot.mjs prepare > load-test/target.json
//   node load-test/setup/slot.mjs verify    → 실제 DB 상태로 불변식 검사(핵심 검증)
//   node load-test/setup/slot.mjs clean     → 테스트가 만든 예약 삭제 + 슬롯 카운터 복구
//
// 대상 슬롯은 활성 체육관 중 첫 번째의 첫 종목·첫 시간대, 14일 뒤 날짜로 고른다.
// 휴관일에 걸리면 예약이 전부 거부되므로 결과가 0건으로 나온다(그때는 날짜를 조정할 것).

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// 부하 테스트가 만든 예약은 이 prefix의 userId를 가진다 → clean이 정확히 이것만 지운다.
const UID_PREFIX = "k6load-";

async function pickTarget() {
  const gym = await prisma.gym.findFirst({
    where: { isActive: true },
    include: { sports: true },
  });
  if (!gym) throw new Error("활성 체육관이 없습니다. db:seed를 먼저 실행하세요.");
  const sport = gym.sports[0]?.sport;
  if (!sport) throw new Error(`${gym.id}에 종목이 없습니다.`);

  const times = Array.isArray(gym.availableTimes) ? gym.availableTimes : [];
  const time = times[0];
  if (!time) throw new Error(`${gym.id}에 예약 가능 시간이 없습니다.`);

  // 휴관일/과거시간 룰을 피하려고 넉넉히 미래로 잡되, 폼 상한(약 2개월) 안쪽으로 둔다.
  const d = new Date();
  d.setDate(d.getDate() + 14);
  const date = d.toISOString().slice(0, 10);

  return { gymId: gym.id, sport, date, time, capacity: 10 };
}

async function prepare() {
  const t = await pickTarget();
  await prisma.reservationSlot.upsert({
    where: {
      gymId_sport_date_time: {
        gymId: t.gymId,
        sport: t.sport,
        date: t.date,
        time: t.time,
      },
    },
    create: { ...t, reservedCount: 0, isClosed: false },
    update: { capacity: t.capacity, reservedCount: 0, isClosed: false },
  });
  // 이전 회차 잔여물 제거
  await prisma.reservation.deleteMany({
    where: { userId: { startsWith: UID_PREFIX } },
  });
  console.log(JSON.stringify(t));
}

async function verify() {
  const t = await pickTarget();
  const [slot, reservations, locks] = await Promise.all([
    prisma.reservationSlot.findUnique({
      where: {
        gymId_sport_date_time: {
          gymId: t.gymId,
          sport: t.sport,
          date: t.date,
          time: t.time,
        },
      },
    }),
    prisma.reservation.findMany({
      where: {
        gymId: t.gymId,
        sport: t.sport,
        date: t.date,
        time: t.time,
        status: "reserved",
      },
      select: { id: true, userId: true, activeKey: true },
    }),
    prisma.reservationLock.count(),
  ]);

  const uniqueUsers = new Set(reservations.map((r) => r.userId)).size;
  const uniqueKeys = new Set(reservations.map((r) => r.activeKey)).size;

  console.log(
    JSON.stringify(
      {
        capacity: slot?.capacity ?? null,
        reservedCount: slot?.reservedCount ?? null,
        actualReservations: reservations.length,
        uniqueUsers,
        uniqueActiveKeys: uniqueKeys,
        totalLocks: locks,
      },
      null,
      2,
    ),
  );
}

async function clean() {
  const t = await pickTarget();
  const del = await prisma.reservation.deleteMany({
    where: { userId: { startsWith: UID_PREFIX } },
  });
  await prisma.reservationSlot.updateMany({
    where: { gymId: t.gymId, sport: t.sport, date: t.date, time: t.time },
    data: { reservedCount: 0 },
  });
  console.log(`테스트 예약 ${del.count}건 삭제, 슬롯 카운터 0으로 복구`);
}

const mode = process.argv[2];
try {
  if (mode === "prepare") await prepare();
  else if (mode === "verify") await verify();
  else if (mode === "clean") await clean();
  else {
    console.error("사용법: node db-util.mjs <prepare|verify|clean>");
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
