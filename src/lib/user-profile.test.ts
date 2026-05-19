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

// 표준 1×1 JPEG/PNG base64. 매직 바이트(FFD8FF / 89504E47…)부터 시작하는
// 실제 이미지이며, validateProfilePhotoInput의 prefix + payload 패턴 + 매직 바이트
// + base64 padding 검증을 모두 통과한다.
const VALID_JPEG_BASE64 =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/8A8B/9k=";
const VALID_PNG_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe("validateProfilePhotoInput", () => {
  it("photoBase64가 null이면 null 입력으로 통과시킨다", () => {
    expect(validateProfilePhotoInput({ photoBase64: null })).toEqual({
      ok: true,
      input: { photoBase64: null },
    });
  });

  it("실제 1×1 JPEG data URL을 정상 입력으로 통과시킨다", () => {
    expect(validateProfilePhotoInput({ photoBase64: VALID_JPEG_BASE64 })).toEqual({
      ok: true,
      input: { photoBase64: VALID_JPEG_BASE64 },
    });
  });

  it("실제 1×1 PNG data URL도 정상 입력으로 통과시킨다", () => {
    expect(validateProfilePhotoInput({ photoBase64: VALID_PNG_BASE64 })).toEqual({
      ok: true,
      input: { photoBase64: VALID_PNG_BASE64 },
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
        photoBase64: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
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

  it("base64 payload에 영문/숫자/+//=이 아닌 문자가 섞이면 거부한다", () => {
    const broken = "data:image/jpeg;base64,/9j/한글payload";
    expect(validateProfilePhotoInput({ photoBase64: broken })).toEqual({
      ok: false,
      message: "프로필 사진은 JPEG 또는 PNG data URL 형식이어야 합니다.",
    });
  });

  it("base64 padding이 4의 배수가 아니면 거부한다", () => {
    // prefix는 통과하지만 payload 길이가 4의 배수가 아닌 케이스.
    const bad = "data:image/jpeg;base64,/9j/abc";
    expect(validateProfilePhotoInput({ photoBase64: bad })).toEqual({
      ok: false,
      message: "프로필 사진 데이터가 손상되었습니다. 다시 시도해 주세요.",
    });
  });

  it("mime은 jpeg인데 payload가 PNG 매직 바이트로 시작하면 거부한다", () => {
    const mismatched = `data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=`;
    expect(validateProfilePhotoInput({ photoBase64: mismatched })).toEqual({
      ok: false,
      message: "프로필 사진이 실제 JPEG/PNG 이미지가 아닙니다.",
    });
  });

  it("mime은 png인데 payload가 JPEG 매직 바이트로 시작하면 거부한다", () => {
    // 길이/패딩은 PNG 매직 prefix와 같이 맞추되 시작이 JPEG.
    const mismatched = `data:image/png;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/8A8B/9k=`;
    expect(validateProfilePhotoInput({ photoBase64: mismatched })).toEqual({
      ok: false,
      message: "프로필 사진이 실제 JPEG/PNG 이미지가 아닙니다.",
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
