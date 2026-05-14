import { describe, expect, it } from "vitest";
import {
  getUserProfile,
  upsertUserProfile,
} from "@/lib/server/mysql-user-profile-repository";
import { prisma } from "@/lib/server/prisma-client";

describe("mysql-user-profile-repository", () => {
  it("저장된 프로필이 없으면 null을 반환한다", async () => {
    await expect(getUserProfile("missing-profile-user")).resolves.toBeNull();
  });

  it("사용자 프로필을 생성하고 같은 사용자 업데이트를 한 행으로 유지한다", async () => {
    const userId = "profile-repository-user";

    const created = await upsertUserProfile(userId, {
      nickname: "나경",
      preferredRegion: "서울 강서구",
      preferredSports: ["배드민턴", "탁구"],
      reservationNotificationsEnabled: true,
    });
    const updated = await upsertUserProfile(userId, {
      nickname: null,
      preferredRegion: "서울 마포구",
      preferredSports: ["농구"],
      reservationNotificationsEnabled: false,
    });

    expect(created).toMatchObject({
      userId,
      nickname: "나경",
      preferredRegion: "서울 강서구",
      preferredSports: ["배드민턴", "탁구"],
      reservationNotificationsEnabled: true,
    });
    expect(updated).toMatchObject({
      userId,
      nickname: null,
      preferredRegion: "서울 마포구",
      preferredSports: ["농구"],
      reservationNotificationsEnabled: false,
    });
    expect(await prisma.userProfile.count({ where: { userId } })).toBe(1);
    expect(new Date(updated.createdAt).toString()).not.toBe("Invalid Date");
    expect(new Date(updated.updatedAt).toString()).not.toBe("Invalid Date");
  });
});
