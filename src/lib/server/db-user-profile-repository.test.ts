import { describe, expect, it } from "vitest";
import {
  ensureUserProfile,
  getUserProfile,
  upsertUserProfile,
} from "@/lib/server/db-user-profile-repository";
import { prisma } from "@/lib/server/prisma-client";

describe("db-user-profile-repository", () => {
  it("저장된 프로필이 없으면 null을 반환한다", async () => {
    await expect(getUserProfile("missing-profile-user")).resolves.toBeNull();
  });

  it("upsert는 provider와 함께 저장되고 같은 사용자 업데이트를 한 행으로 유지한다", async () => {
    const userId = "profile-repository-user";

    const created = await upsertUserProfile(
      userId,
      {
        name: "김나경",
        phone: "010-1234-5678",
        birthDate: "1990-01-01",
        address: "서울 강서구",
        reservationNotificationsEnabled: true,
      },
      "local",
    );
    const updated = await upsertUserProfile(
      userId,
      {
        name: "이나경",
        phone: "02-123-4567",
        birthDate: null,
        address: "서울 마포구",
        reservationNotificationsEnabled: false,
      },
      "local",
    );

    expect(created).toMatchObject({
      userId,
      provider: "local",
      name: "김나경",
      phone: "010-1234-5678",
      birthDate: "1990-01-01",
      address: "서울 강서구",
      reservationNotificationsEnabled: true,
      // 닉네임/선호는 upsert가 쓰지 않으므로 생성 시 기본값(null/[])로 남는다.
      nickname: null,
      preferredRegion: null,
      preferredSports: [],
    });
    expect(updated).toMatchObject({
      userId,
      provider: "local",
      name: "이나경",
      phone: "02-123-4567",
      birthDate: null,
      address: "서울 마포구",
      reservationNotificationsEnabled: false,
    });
    expect(await prisma.userProfile.count({ where: { userId } })).toBe(1);
    expect(new Date(updated.createdAt).toString()).not.toBe("Invalid Date");
    expect(new Date(updated.updatedAt).toString()).not.toBe("Invalid Date");
  });

  it("ensure는 없을 때 자동 닉네임으로 생성하고 있을 때 provider만 동기화한다", async () => {
    const userId = "profile-ensure-user";

    const created = await ensureUserProfile(userId, "kakao");
    expect(created).toMatchObject({
      userId,
      provider: "kakao",
      preferredRegion: null,
      preferredSports: [],
      reservationNotificationsEnabled: true,
    });
    // 자동 생성된 닉네임: 비어있지 않은 문자열 + 8자 이내.
    expect(typeof created.nickname).toBe("string");
    expect((created.nickname ?? "").length).toBeGreaterThan(0);
    expect([...(created.nickname ?? "")].length).toBeLessThanOrEqual(8);

    // 사용자가 닉네임을 변경한 상황 시뮬레이트.
    await prisma.userProfile.update({
      where: { userId },
      data: { nickname: "직접입력" },
    });

    // 다른 provider로 다시 보장하면 provider만 갱신되고 nickname은 유지.
    const synced = await ensureUserProfile(userId, "naver");
    expect(synced).toMatchObject({
      userId,
      provider: "naver",
      nickname: "직접입력",
    });
    expect(await prisma.userProfile.count({ where: { userId } })).toBe(1);
  });

  it("provider가 null이어도 row를 만든다 (알 수 없는 sign-in)", async () => {
    const userId = "profile-unknown-provider-user";
    const created = await ensureUserProfile(userId, null);
    expect(created.provider).toBeNull();
  });
});
