import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma-client";
import { getReservationActiveKey } from "@/lib/reservation-repository";

// 외부 OAuth 가입(카카오/네이버) 시 익명 uid의 활동 데이터를 새 targetUid로 이전한다.
//
// 정책 (v4 §8):
//   - 신규 provider 가입(needsTransfer=true)에만 호출. 기존 가입에는 호출하지 않는다.
//   - idempotent: 같은 anonUid→targetUid를 두 번 호출해도 결과 동일.
//   - UserProfile/Reservation/ReservationLock 충돌은 MigrationConflictError로 실패 처리.
//     예약 자동 삭제/취소는 하지 않는다. 사용자에게 안내하고 운영자 개입 또는 재시도.
//   - Favorite는 같은 gymId가 target에 이미 있으면 anon 측 행만 삭제(중복 제거).
//
// Reservation은 userId 변경 시 activeKey도 재계산해야 한다.
// ReservationLock은 PK가 activeKey라서 새 activeKey로 갱신해야 한다.
// 현재 구현은 Prisma의 PK update를 시도한다(MySQL에서 가능). 실패 시 호출자에게 오류 전파.

export class MigrationConflictError extends Error {
  constructor(public readonly conflicts: string[]) {
    super(`계정 데이터 이전 중 충돌이 발생했습니다: ${conflicts.join(", ")}`);
    this.name = "MigrationConflictError";
  }
}

export async function migrateAnonymousToTarget(input: {
  anonUid: string;
  targetUid: string;
}): Promise<void> {
  const { anonUid, targetUid } = input;
  if (anonUid === targetUid) {
    throw new Error("anonUid와 targetUid는 달라야 합니다.");
  }

  await prisma.$transaction(
    async (tx) => {
      // 1) UserProfile
      const [anonProfile, targetProfile] = await Promise.all([
        tx.userProfile.findUnique({ where: { userId: anonUid } }),
        tx.userProfile.findUnique({ where: { userId: targetUid } }),
      ]);
      if (anonProfile && targetProfile) {
        // 신규 가입 흐름에서는 거의 발생하지 않음. 발생하면 충돌.
        throw new MigrationConflictError([
          "UserProfile: target 사용자 프로필이 이미 존재합니다.",
        ]);
      }
      if (anonProfile && !targetProfile) {
        await tx.userProfile.update({
          where: { userId: anonUid },
          data: { userId: targetUid },
        });
      }
      // anonProfile이 없으면 skip (idempotent: 이미 옮겨졌거나 처음부터 없음).

      // 2) Favorite — 중복 gymId는 anon 측 행 삭제(중복 제거), 나머지는 userId 갱신.
      const anonFavorites = await tx.favorite.findMany({
        where: { userId: anonUid },
        select: { gymId: true },
      });
      if (anonFavorites.length > 0) {
        const existing = await tx.favorite.findMany({
          where: {
            userId: targetUid,
            gymId: { in: anonFavorites.map((f) => f.gymId) },
          },
          select: { gymId: true },
        });
        const targetGymIds = new Set(existing.map((f) => f.gymId));

        for (const fav of anonFavorites) {
          if (targetGymIds.has(fav.gymId)) {
            await tx.favorite.delete({
              where: {
                userId_gymId: { userId: anonUid, gymId: fav.gymId },
              },
            });
          } else {
            await tx.favorite.update({
              where: {
                userId_gymId: { userId: anonUid, gymId: fav.gymId },
              },
              data: { userId: targetUid },
            });
          }
        }
      }

      // 3) Reservation + ReservationLock
      const anonReservations = await tx.reservation.findMany({
        where: { userId: anonUid },
      });
      if (anonReservations.length > 0) {
        // (gymId, sport, date, time) 충돌 검사 — 자동 삭제/취소는 하지 않는다.
        const conflictReservations = await tx.reservation.findMany({
          where: {
            userId: targetUid,
            OR: anonReservations.map((r) => ({
              gymId: r.gymId,
              sport: r.sport,
              date: r.date,
              time: r.time,
            })),
          },
          select: { gymId: true, sport: true, date: true, time: true },
        });
        if (conflictReservations.length > 0) {
          const sample = conflictReservations
            .slice(0, 3)
            .map((r) => `${r.gymId}/${r.sport}/${r.date}/${r.time}`);
          throw new MigrationConflictError([
            `Reservation: ${sample.join(", ")} 슬롯이 target 계정에도 존재합니다.`,
          ]);
        }

        for (const reservation of anonReservations) {
          const newActiveKey = getReservationActiveKey({
            ...reservation,
            userId: targetUid,
          });
          const oldActiveKey = reservation.activeKey;

          // ReservationLock 먼저 갱신 (PK update).
          const lock = await tx.reservationLock.findUnique({
            where: { activeKey: oldActiveKey },
          });
          if (lock) {
            // target uid 기준의 새 activeKey가 충돌하지 않는지 확인.
            const conflictLock = await tx.reservationLock.findUnique({
              where: { activeKey: newActiveKey },
            });
            if (conflictLock) {
              throw new MigrationConflictError([
                `ReservationLock: ${newActiveKey} 키가 이미 존재합니다.`,
              ]);
            }
            await tx.reservationLock.update({
              where: { activeKey: oldActiveKey },
              data: { activeKey: newActiveKey },
            });
          }

          await tx.reservation.update({
            where: { id: reservation.id },
            data: { userId: targetUid, activeKey: newActiveKey },
          });
        }
      }
    },
    {
      // ReservationLock PK update 동시성 보호.
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}
