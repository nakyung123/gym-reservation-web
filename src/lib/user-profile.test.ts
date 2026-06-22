import { describe, expect, it } from "vitest";
import {
  isUserProfile,
  validateUserProfileInput,
  type UserProfile,
} from "@/lib/user-profile";

const profile: UserProfile = {
  userId: "profile-user",
  nickname: "나경",
  provider: "local",
  name: "김나경",
  phone: "010-1234-5678",
  birthDate: "1990-01-01",
  address: "서울 강서구",
  preferredRegion: "서울 강서구",
  preferredSports: ["배드민턴", "탁구"],
  reservationNotificationsEnabled: true,
  createdAt: "2026-05-14T03:00:00.000Z",
  updatedAt: "2026-05-14T03:00:00.000Z",
};

describe("validateUserProfileInput", () => {
  it("회원정보 입력을 정리한다(앞뒤 공백 제거)", () => {
    expect(
      validateUserProfileInput({
        name: "  김나경  ",
        phone: " 010-1234-5678 ",
        birthDate: " 1990-01-01 ",
        address: "  서울 강서구  ",
        reservationNotificationsEnabled: false,
      }),
    ).toEqual({
      ok: true,
      input: {
        name: "김나경",
        phone: "010-1234-5678",
        birthDate: "1990-01-01",
        address: "서울 강서구",
        reservationNotificationsEnabled: false,
      },
    });
  });

  it("빈 문자열은 저장하지 않는 값(null)으로 정리한다", () => {
    expect(
      validateUserProfileInput({
        name: " ",
        phone: "",
        birthDate: "",
        address: "",
        reservationNotificationsEnabled: true,
      }),
    ).toEqual({
      ok: true,
      input: {
        name: null,
        phone: null,
        birthDate: null,
        address: null,
        reservationNotificationsEnabled: true,
      },
    });
  });

  it("연락처는 숫자/하이픈 외 문자를 거부한다", () => {
    expect(
      validateUserProfileInput({
        name: null,
        phone: "010-abcd-5678",
        birthDate: null,
        address: null,
        reservationNotificationsEnabled: true,
      }),
    ).toEqual({
      ok: false,
      message: "연락처는 숫자와 하이픈(-)만, 숫자 9자리 이상이어야 합니다.",
    });
  });

  it("생년월일 형식이 YYYY-MM-DD가 아니면 거부한다", () => {
    expect(
      validateUserProfileInput({
        name: null,
        phone: null,
        birthDate: "1990/01/01",
        address: null,
        reservationNotificationsEnabled: true,
      }),
    ).toEqual({
      ok: false,
      message: "생년월일은 YYYY-MM-DD 형식이어야 합니다.",
    });
  });

  it("달력상 존재하지 않는 생년월일은 거부한다", () => {
    expect(
      validateUserProfileInput({
        name: null,
        phone: null,
        birthDate: "1990-13-01",
        address: null,
        reservationNotificationsEnabled: true,
      }),
    ).toEqual({
      ok: false,
      message: "올바른 생년월일이 아닙니다.",
    });
  });

  it("미래 생년월일은 거부한다", () => {
    expect(
      validateUserProfileInput({
        name: null,
        phone: null,
        birthDate: "2999-01-01",
        address: null,
        reservationNotificationsEnabled: true,
      }),
    ).toEqual({
      ok: false,
      message: "생년월일은 오늘 이후일 수 없습니다.",
    });
  });

  it("이름 길이 제한을 넘으면 거부한다", () => {
    expect(
      validateUserProfileInput({
        name: "가".repeat(31),
        phone: null,
        birthDate: null,
        address: null,
        reservationNotificationsEnabled: true,
      }),
    ).toEqual({
      ok: false,
      message: "이름은 30자 이하로 입력해야 합니다.",
    });
  });

  it("예약 알림 설정이 boolean이 아니면 거부한다", () => {
    expect(
      validateUserProfileInput({
        name: null,
        phone: null,
        birthDate: null,
        address: null,
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
    expect(isUserProfile({ ...profile, provider: null })).toBe(true);
    expect(
      isUserProfile({ ...profile, name: null, phone: null, birthDate: null, address: null }),
    ).toBe(true);
    expect(isUserProfile({ ...profile, provider: "unknown" })).toBe(false);
    expect(isUserProfile({ ...profile, name: 123 })).toBe(false);
    expect(isUserProfile({ ...profile, preferredSports: ["축구"] })).toBe(false);
    expect(
      isUserProfile({ ...profile, reservationNotificationsEnabled: "true" }),
    ).toBe(false);
  });
});
