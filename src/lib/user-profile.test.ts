import { describe, expect, it } from "vitest";
import {
  isUserProfile,
  validateProfilePhotoInput,
  validateUserProfileInput,
  type UserProfile,
} from "@/lib/user-profile";

const profile: UserProfile = {
  userId: "profile-user",
  nickname: "나경",
  provider: "local",
  photoBase64: null,
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

describe("validateProfilePhotoInput", () => {
  it("photoBase64가 null이면 null 입력으로 통과시킨다", () => {
    expect(validateProfilePhotoInput({ photoBase64: null })).toEqual({
      ok: true,
      input: { photoBase64: null },
    });
  });

  it("JPEG data URL을 정상 입력으로 통과시킨다", () => {
    const value = "data:image/jpeg;base64,abc123";
    expect(validateProfilePhotoInput({ photoBase64: value })).toEqual({
      ok: true,
      input: { photoBase64: value },
    });
  });

  it("PNG data URL도 정상 입력으로 통과시킨다", () => {
    const value = "data:image/png;base64,abc123";
    expect(validateProfilePhotoInput({ photoBase64: value })).toEqual({
      ok: true,
      input: { photoBase64: value },
    });
  });

  it("객체가 아니면 거부한다", () => {
    expect(validateProfilePhotoInput(null)).toEqual({
      ok: false,
      message: "요청 본문이 올바르지 않습니다.",
    });
    expect(validateProfilePhotoInput("foo")).toEqual({
      ok: false,
      message: "요청 본문이 올바르지 않습니다.",
    });
    expect(validateProfilePhotoInput([])).toEqual({
      ok: false,
      message: "요청 본문이 올바르지 않습니다.",
    });
  });

  it("photoBase64가 문자열도 null도 아니면 거부한다", () => {
    expect(validateProfilePhotoInput({ photoBase64: 123 })).toEqual({
      ok: false,
      message: "프로필 사진은 문자열 또는 null이어야 합니다.",
    });
  });

  it("JPEG/PNG 외 형식 data URL은 거부한다", () => {
    expect(
      validateProfilePhotoInput({
        photoBase64: "data:image/gif;base64,abc",
      }),
    ).toEqual({
      ok: false,
      message: "프로필 사진은 JPEG 또는 PNG data URL 형식이어야 합니다.",
    });
  });

  it("data URL prefix가 없으면 거부한다", () => {
    expect(
      validateProfilePhotoInput({ photoBase64: "iVBORw0KGgoAAAANSUhEUgAA" }),
    ).toEqual({
      ok: false,
      message: "프로필 사진은 JPEG 또는 PNG data URL 형식이어야 합니다.",
    });
  });

  it("200,000자를 초과하면 거부한다", () => {
    const huge = `data:image/jpeg;base64,${"a".repeat(200_000)}`;
    expect(validateProfilePhotoInput({ photoBase64: huge })).toEqual({
      ok: false,
      message: "프로필 사진의 용량이 너무 큽니다. 더 작은 이미지를 사용해 주세요.",
    });
  });
});

describe("isUserProfile", () => {
  it("프로필 응답 형식을 검증한다", () => {
    expect(isUserProfile(profile)).toBe(true);
    expect(isUserProfile({ ...profile, provider: null })).toBe(true);
    expect(
      isUserProfile({ ...profile, provider: "unknown" }),
    ).toBe(false);
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
