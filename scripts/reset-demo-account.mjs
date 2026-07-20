// 공개 데모 계정 초기화.
//
// README에 자격을 공개한 체험 계정은 누구나 쓸 수 있어서 시간이 지나면 상태가 흐트러진다.
//   - 비밀번호 변경: 클라이언트에서 Firebase SDK로 직접 하므로 서버에서 막을 수 없다.
//     (탈퇴는 src/lib/server/demo-account.ts 가드로 서버에서 차단한다.)
//   - 예약 누적: 방문자가 만든 예약이 계속 쌓인다.
//   - 프로필 변경: 이름·연락처가 임의 값으로 바뀔 수 있다.
//
// 이 스크립트는 셋 다 원래대로 되돌린다. 주기적으로 실행한다.
//
// 사용 (운영):
//   $env:DATABASE_URL="<운영 URL>"; $env:PRISMA_ENV="production"
//   node scripts/reset-demo-account.mjs
//
// 필요한 환경변수: DEMO_USER_UID, DEMO_USER_PASSWORD, FIREBASE_ADMIN_*, DATABASE_URL

import admin from "firebase-admin";
import { PrismaClient } from "@prisma/client";

const UID = process.env.DEMO_USER_UID?.trim();
const PASSWORD = process.env.DEMO_USER_PASSWORD;
const NAME = process.env.DEMO_USER_NAME ?? "체험 계정";
const PHONE = process.env.DEMO_USER_PHONE ?? "010-0000-0000";

if (!UID) throw new Error("DEMO_USER_UID가 필요합니다.");
if (!PASSWORD) throw new Error("DEMO_USER_PASSWORD가 필요합니다.");

function initAdmin() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("FIREBASE_ADMIN_* 환경변수가 없습니다.");
  }
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
  }
  return admin.auth();
}

const auth = initAdmin();
const prisma = new PrismaClient();

// 1) 비밀번호를 공개된 값으로 되돌린다(방문자가 바꿨을 수 있다).
await auth.updateUser(UID, { password: PASSWORD, emailVerified: true });
console.log("비밀번호 초기화 완료");

// 2) 데모 계정이 만든 예약을 회수한다.
//    슬롯 카운터를 먼저 되돌리지 않으면 그 시간대 정원이 영구히 줄어든다.
const active = await prisma.reservation.findMany({
  where: { userId: UID, status: "reserved" },
  select: { gymId: true, sport: true, date: true, time: true },
});

for (const r of active) {
  await prisma.reservationSlot.updateMany({
    where: {
      gymId: r.gymId,
      sport: r.sport,
      date: r.date,
      time: r.time,
      reservedCount: { gt: 0 },
    },
    data: { reservedCount: { decrement: 1 } },
  });
}

const locks = await prisma.reservationLock.deleteMany({
  where: { reservation: { userId: UID } },
});
const reservations = await prisma.reservation.deleteMany({
  where: { userId: UID },
});
const favorites = await prisma.favorite.deleteMany({ where: { userId: UID } });

console.log(
  `예약 ${reservations.count}건 / lock ${locks.count}건 / 즐겨찾기 ${favorites.count}건 회수 ` +
    `(슬롯 카운터 ${active.length}건 복구)`,
);

// 3) 프로필 표시 정보를 원래 값으로.
await prisma.userProfile.updateMany({
  where: { userId: UID },
  data: { name: NAME, phone: PHONE },
});
console.log("프로필 초기화 완료");

await prisma.$disconnect();
