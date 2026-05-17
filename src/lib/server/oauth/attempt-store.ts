import "server-only";
import { prisma } from "@/lib/server/prisma-client";
import { generateOpaqueToken } from "@/lib/server/oauth/oauth-state";

// /start와 /callback 사이를 잇는 1회용 attempt store.
// /start에서 state를 발급해 저장하고, /callback에서 1회 소비한다.
// 익명 흐름 제거 후 anonUid 컬럼은 없다.
// 만료된 행은 호출 시점에 opportunistic cleanup.

export const OAUTH_ATTEMPT_TTL_MS = 5 * 60 * 1000;

type ExternalProvider = "kakao" | "naver";

export type OAuthAttemptRecord = {
  attemptId: string;
  provider: string;
  state: string;
  status: string;
  createdAt: Date;
  expiresAt: Date;
};

export async function createAttempt(input: {
  provider: ExternalProvider;
}): Promise<{ attemptId: string; state: string; expiresAt: Date }> {
  await cleanupExpiredAttempts();

  const attemptId = generateOpaqueToken();
  const state = generateOpaqueToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OAUTH_ATTEMPT_TTL_MS);

  await prisma.oAuthAttempt.create({
    data: {
      attemptId,
      provider: input.provider,
      state,
      status: "pending",
      createdAt: now,
      expiresAt,
    },
  });

  return { attemptId, state, expiresAt };
}

// pending 상태인 attempt 1회 소비. 만료 또는 status 불일치면 null.
// 트랜잭션 내에서 read-then-update.
export async function consumePendingAttempt(
  attemptId: string,
): Promise<OAuthAttemptRecord | null> {
  await cleanupExpiredAttempts();

  return prisma.$transaction(async (tx) => {
    const found = await tx.oAuthAttempt.findUnique({
      where: { attemptId },
    });
    if (!found) return null;
    if (found.status !== "pending") return null;
    if (found.expiresAt.getTime() < Date.now()) return null;
    await tx.oAuthAttempt.update({
      where: { attemptId },
      data: { status: "consumed" },
    });
    return found;
  });
}

async function cleanupExpiredAttempts(): Promise<void> {
  try {
    await prisma.oAuthAttempt.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  } catch (error) {
    console.error("[oauth-attempt-store] cleanup failed:", error);
  }
}
