import { describe, expect, it } from "vitest";
import {
  ensureUserProfile,
  getUserProfile,
  updateUserProfilePhoto,
  upsertUserProfile,
} from "@/lib/server/mysql-user-profile-repository";
import { prisma } from "@/lib/server/prisma-client";

// 실제 1×1 PNG base64 (매직 바이트부터 시작). repository는 형식 검증을 하지 않지만
// validateProfilePhotoInput과 일관성을 위해 유효한 데이터를 사용한다.
const SAMPLE_PHOTO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe("mysql-user-profile-repository", () => {
  it("저장된 프로필이 없으면 null을 반환한다", async () => {
    await expect(getUserProfile("missing-profile-user")).resolves.toBeNull();
  });

  it("upsert는 provider와 함께 저장되고 같은 사용자 업데이트를 한 행으로 유지한다", async () => {
    const userId = "profile-repository-user";

    const created = await upsertUserProfile(
      userId,
      {
        nickname: "나경",
        preferredRegion: "서울 강서구",
        preferredSports: ["배드민턴", "탁구"],
        reservationNotificationsEnabled: true,
      },
      "local",
    );
    const updated = await upsertUserProfile(
      userId,
      {
        nickname: null,
        preferredRegion: "서울 마포구",
        preferredSports: ["농구"],
        reservationNotificationsEnabled: false,
      },
      "local",
    );

    expect(created).toMatchObject({
      userId,
      nickname: "나경",
      provider: "local",
      preferredRegion: "서울 강서구",
      preferredSports: ["배드민턴", "탁구"],
      reservationNotificationsEnabled: true,
    });
    expect(updated).toMatchObject({
      userId,
      nickname: null,
      provider: "local",
      preferredRegion: "서울 마포구",
      preferredSports: ["농구"],
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

describe("updateUserProfilePhoto", () => {
  it("기존 row가 있으면 photoBase64만 갱신하고 나머지 필드는 유지한다", async () => {
    const userId = "photo-existing-user";
    await upsertUserProfile(
      userId,
      {
        nickname: "기존닉",
        preferredRegion: "서울 강남구",
        preferredSports: ["배드민턴"],
        reservationNotificationsEnabled: true,
      },
      "local",
    );

    const updated = await updateUserProfilePhoto(userId, SAMPLE_PHOTO, "local");

    expect(updated).toMatchObject({
      userId,
      nickname: "기존닉",
      provider: "local",
      photoBase64: SAMPLE_PHOTO,
      preferredRegion: "서울 강남구",
      preferredSports: ["배드민턴"],
      reservationNotificationsEnabled: true,
    });
    expect(await prisma.userProfile.count({ where: { userId } })).toBe(1);
  });

  it("photoBase64를 null로 보내면 기본 이미지로 비울 수 있다", async () => {
    const userId = "photo-clear-user";
    await upsertUserProfile(
      userId,
      {
        nickname: "닉네임",
        preferredRegion: null,
        preferredSports: [],
        reservationNotificationsEnabled: true,
      },
      "local",
    );
    await updateUserProfilePhoto(userId, SAMPLE_PHOTO, "local");

    const cleared = await updateUserProfilePhoto(userId, null, "local");
    expect(cleared.photoBase64).toBeNull();
  });

  it("row가 없으면 ensureUserProfile로 새로 만들고 사진을 같이 채운다", async () => {
    const userId = "photo-new-user";
    await expect(
      prisma.userProfile.count({ where: { userId } }),
    ).resolves.toBe(0);

    const created = await updateUserProfilePhoto(userId, SAMPLE_PHOTO, "kakao");

    expect(created).toMatchObject({
      userId,
      provider: "kakao",
      photoBase64: SAMPLE_PHOTO,
      preferredRegion: null,
      preferredSports: [],
      reservationNotificationsEnabled: true,
    });
    // 자동 닉네임이 들어가 있다.
    expect(typeof created.nickname).toBe("string");
    expect((created.nickname ?? "").length).toBeGreaterThan(0);
    expect(await prisma.userProfile.count({ where: { userId } })).toBe(1);
  });
});
