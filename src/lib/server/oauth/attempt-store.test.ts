import { describe, expect, it } from "vitest";
import {
  createAttempt,
  consumePendingAttempt,
  OAUTH_ATTEMPT_TTL_MS,
} from "@/lib/server/oauth/attempt-store";
import { prisma } from "@/lib/server/prisma-client";

describe("oauth attempt-store", () => {
  it("createAttempt가 attemptId, state, expiresAt을 발급하고 DB에 pending 상태로 저장한다", async () => {
    const before = Date.now();
    const result = await createAttempt({ provider: "kakao" });

    expect(result.attemptId).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(result.state).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(result.attemptId).not.toBe(result.state);
    expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + OAUTH_ATTEMPT_TTL_MS - 1000,
    );

    const stored = await prisma.oAuthAttempt.findUnique({
      where: { attemptId: result.attemptId },
    });
    expect(stored).not.toBeNull();
    expect(stored?.provider).toBe("kakao");
    expect(stored?.state).toBe(result.state);
    expect(stored?.status).toBe("pending");
  });

  it("consumePendingAttempt는 pending 행을 consumed로 갱신하고 record를 반환한다", async () => {
    const { attemptId } = await createAttempt({ provider: "kakao" });

    const consumed = await consumePendingAttempt(attemptId);
    expect(consumed?.attemptId).toBe(attemptId);

    const stored = await prisma.oAuthAttempt.findUnique({
      where: { attemptId },
    });
    expect(stored?.status).toBe("consumed");
  });

  it("이미 consumed인 attempt는 다시 소비할 수 없다", async () => {
    const { attemptId } = await createAttempt({ provider: "kakao" });
    await consumePendingAttempt(attemptId);
    const second = await consumePendingAttempt(attemptId);
    expect(second).toBeNull();
  });

  it("만료된 attempt는 소비할 수 없고 cleanup으로 제거된다", async () => {
    const { attemptId } = await createAttempt({ provider: "kakao" });
    await prisma.oAuthAttempt.update({
      where: { attemptId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const result = await consumePendingAttempt(attemptId);
    expect(result).toBeNull();

    const stored = await prisma.oAuthAttempt.findUnique({
      where: { attemptId },
    });
    expect(stored).toBeNull();
  });

  it("존재하지 않는 attemptId는 null을 반환한다", async () => {
    const result = await consumePendingAttempt("nonexistent-attempt-id");
    expect(result).toBeNull();
  });
});
