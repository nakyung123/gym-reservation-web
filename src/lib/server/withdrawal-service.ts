import "server-only";
import { prisma } from "@/lib/server/prisma-client";
import { getAdminAuth } from "@/lib/server/firebase-admin";
import type { WithdrawalInput } from "@/lib/withdrawal";

// 회원 탈퇴 처리 service.
// 1. 진행 중 예약(status="reserved") 검사 → 있으면 차단.
// 2. 사용자 데이터 hard delete (Reservation → ReservationLock cascade, Favorite, Inquiry, 본인 VocPost, UserProfile).
// 3. Firebase Auth user 삭제.
// 4. 익명 사유 기록 (uid 미저장).
// DB 작업은 트랜잭션으로 묶고, Firebase Auth 삭제는 트랜잭션 외부에서 수행한다
// (외부 호출이라 DB 트랜잭션 timeout 영향 회피).

export type WithdrawAccountResult =
  | { ok: true }
  | { ok: false; reason: "active-reservation"; message: string }
  | { ok: false; reason: "auth-delete-failed"; message: string }
  | { ok: false; reason: "error"; message: string };

// 트랜잭션 내부에서 진행 중 예약을 발견했을 때 전체 롤백을 위해 던지는 sentinel.
class ActiveReservationExistsError extends Error {
  constructor() {
    super("active-reservation-exists");
  }
}

export async function withdrawAccount(
  userId: string,
  input: WithdrawalInput,
): Promise<WithdrawAccountResult> {
  // 1+2. 진행 중 예약 검사와 데이터 삭제를 한 트랜잭션으로 묶는다.
  // 예약 삭제는 status !== "reserved"로 조건을 걸어, 검사~삭제 사이에 새 예약이
  // 끼어들어도 reserved 예약이 hard delete되며 슬롯 reservedCount가 누수되는 일이
  // 없게 한다. 삭제 후에도 reserved가 남아 있으면 전체 롤백 + 탈퇴 차단.
  // Reservation 삭제 시 ReservationLock은 cascade.
  // 1:1 문의(Inquiry)와 본인이 로그인 상태로 작성한 공개 게시판 글(VocPost, userId 연결)도 예약·즐겨찾기·
  // 프로필과 동일하게 hard delete한다(uid 미보관 원칙 일관 + 탈퇴자 연락처/이메일 PII 잔존 방지).
  // userId 스코프라 익명(userId=null) 글은 영향받지 않는다.
  // 사유 기록은 일부러 이 트랜잭션에 포함하지 않는다 — Auth 삭제 실패 후 재시도 시
  // 같은 사유가 중복 기록되지 않도록 Auth 성공 후에 1회만 기록한다(아래 4번).
  try {
    await prisma.$transaction(async (tx) => {
      await tx.reservation.deleteMany({
        where: { userId, status: { not: "reserved" } },
      });
      const activeReservationCount = await tx.reservation.count({
        where: { userId, status: "reserved" },
      });
      if (activeReservationCount > 0) {
        throw new ActiveReservationExistsError();
      }
      await tx.favorite.deleteMany({ where: { userId } });
      await tx.inquiry.deleteMany({ where: { userId } });
      await tx.vocPost.deleteMany({ where: { userId } });
      await tx.userProfile.deleteMany({ where: { userId } });
    });
  } catch (error) {
    if (error instanceof ActiveReservationExistsError) {
      return {
        ok: false,
        reason: "active-reservation",
        message:
          "취소되지 않은 예약이 있어 탈퇴할 수 없습니다. 내 예약에서 모두 취소한 뒤 다시 시도해 주세요.",
      };
    }
    console.error("[withdraw] DB user data delete failed");
    return {
      ok: false,
      reason: "error",
      message: "회원 정보 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  // 3. Firebase Auth user 삭제. DB 삭제가 끝난 다음에 수행한다.
  // DB는 이미 삭제되었지만 Auth가 살아 있으면 사용자가 재로그인 시 빈 프로필이 다시 생성된다.
  // 이 상태는 부분 완료 = 실패로 본다. 명시적 실패 응답으로 사용자에게 알려 재시도하도록.
  // 재시도 시: DB는 비어 있어 진행 중 예약 0건 → DB deleteMany는 noop → Auth delete만 재시도 효과.
  // user-not-found(이미 삭제됨)는 성공으로 취급한다.
  try {
    await getAdminAuth().deleteUser(userId);
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    if (code === "auth/user-not-found") {
      // 이미 다른 경로로 삭제됨. 사유 기록은 4번에서 처리.
      // 다만 user-not-found는 재시도 경로 진입을 모르므로 사유 중복을 피하기 위해 skip.
      return { ok: true };
    }
    console.error(
      "[withdraw] Firebase Auth user delete failed after DB delete succeeded",
    );
    return {
      ok: false,
      reason: "auth-delete-failed",
      message:
        "회원 정보는 삭제되었지만 인증 계정 정리에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  // 4. 탈퇴 사유 기록. Auth 삭제 성공 직후 1회만 시도한다 (재시도 시 중복 방지).
  // 사유 기록 자체가 실패해도 사용자에겐 ok로 응답한다 (이미 계정은 완전 삭제 상태이고
  // 사유는 익명 통계 용도라 비핵심).
  try {
    await prisma.withdrawalReason.create({
      data: { category: input.category, detail: input.detail },
    });
  } catch {
    console.warn("[withdraw] withdrawal reason record failed");
  }

  return { ok: true };
}
