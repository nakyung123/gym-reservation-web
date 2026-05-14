import { describe, expect, it } from "vitest";
import {
  isUserProfile,
  validateUserProfileInput,
  type UserProfile,
} from "@/lib/user-profile";

const profile: UserProfile = {
  userId: "profile-user",
  nickname: "나경",
  preferredRegion: "서울 강서구",
  preferredSports: ["배드민턴", "탁구"],
  reservationNotificationsEnabled: true,
  createdAt: "2026-05-14T03:00:00.000Z",
  updatedAt: "2026-05-14T03:00:00.000Z",
};

describe("validateUserProfileInput", () => {
  it("프로필 설정 입력을 정리하고 선호 종목 중복을 제거한다", () => {
    expect(
      validateUserProfileInput({
        nickname: "  나경  ",
        preferredRegion: "  서울 강서구  ",
        preferredSports: ["배드민턴", "탁구", "배드민턴"],
        reservationNotificationsEnabled: false,
      }),
    ).toEqual({
      ok: true,
      input: {
        nickname: "나경",
        preferredRegion: "서울 강서구",
        preferredSports: ["배드민턴", "탁구"],
        reservationNotificationsEnabled: false,
      },
    });
  });

  it("빈 문자열은 저장하지 않는 값으로 정리한다", () => {
    expect(
      validateUserProfileInput({
        nickname: " ",
        preferredRegion: "",
        preferredSports: [],
        reservationNotificationsEnabled: true,
      }),
    ).toEqual({
      ok: true,
      input: {
        nickname: null,
        preferredRegion: null,
        preferredSports: [],
        reservationNotificationsEnabled: true,
      },
    });
  });

  it("지원하지 않는 선호 종목은 거부한다", () => {
    expect(
      validateUserProfileInput({
        nickname: null,
        preferredRegion: null,
        preferredSports: ["축구"],
        reservationNotificationsEnabled: true,
      }),
    ).toEqual({
      ok: false,
      message: "지원하지 않는 선호 종목입니다: 축구",
    });
  });

  it("예약 알림 설정이 boolean이 아니면 거부한다", () => {
    expect(
      validateUserProfileInput({
        nickname: null,
        preferredRegion: null,
        preferredSports: [],
        reservationNotificationsEnabled: "true",
      }),
    ).toEqual({
      ok: false,
      message: "예약 알림 설정은 boolean이어야 합니다.",
    });
  });
});

describe("isUserProfile", () => {
  it("프로필 응답 형식을 검증한다", () => {
    expect(isUserProfile(profile)).toBe(true);
    expect(
      isUserProfile({
        ...profile,
        preferredSports: ["축구"],
      }),
    ).toBe(false);
    expect(
      isUserProfile({
        ...profile,
        reservationNotificationsEnabled: "true",
      }),
    ).toBe(false);
  });
});
