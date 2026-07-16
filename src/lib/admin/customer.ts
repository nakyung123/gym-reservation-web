// 관리자 고객 관리(customers) 공유 타입·가드. 서버 전용 의존이 없어 UI 번들에도 안전하다.
//
// PII 노출 정책: email/최근 로그인 같은 Firebase Auth 메타는 "상세"에서만 노출한다.
// 목록(CustomerSummary)에는 이름/아이디·provider·가입일·지표만 둔다.
// (닉네임은 자동 생성값이라 운영상 의미가 없어 표시하지 않는다. 식별은 이름 우선, 없으면 아이디.)

export type CustomerProvider = "local" | "google" | "kakao" | "naver" | null;

// provider → 한글 라벨(UI 표시 SSOT).
export function providerLabel(provider: CustomerProvider): string {
  switch (provider) {
    case "local":
      return "이메일";
    case "google":
      return "구글";
    case "kakao":
      return "카카오";
    case "naver":
      return "네이버";
    default:
      return "미상";
  }
}

// 목록 행. DB UserProfile + 예약/즐겨찾기 집계. email 미포함.
export type CustomerSummary = {
  userId: string;
  name: string | null; // 실명(표시 우선)
  loginId: string | null; // 로그인 아이디(이름 없을 때 대체 식별자)
  provider: CustomerProvider;
  createdAt: string; // 프로필 생성일(가입일 근사) ISO
  reservationCount: number; // 전체 예약 수(상태 무관)
  activeFavoriteCount: number; // 활성 체육관 즐겨찾기 수
};

// 상세의 DB 프로필 부분.
export type CustomerProfileInfo = {
  name: string | null;
  loginId: string | null;
  provider: CustomerProvider;
  preferredRegion: string | null;
  preferredSports: string[];
  reservationNotificationsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

// 상세에서만 노출하는 Firebase Auth 메타.
export type CustomerFirebaseMeta = {
  email: string | null;
  emailVerified: boolean;
  disabled: boolean;
  creationTime: string | null; // ISO
  lastSignInTime: string | null; // ISO
  providers: string[]; // providerId 목록
};

export type CustomerReservationSummary = {
  total: number;
  reserved: number;
  cancelled: number;
  used: number;
};

export type CustomerDetail = {
  userId: string;
  profile: CustomerProfileInfo | null;
  reservations: CustomerReservationSummary;
  activeFavoriteCount: number;
  firebase: CustomerFirebaseMeta | null;
  // No Silent Fallback: Firebase 메타 조회가 실패하면 null이 아니라 이 플래그로 구분해
  // UI가 "조회 실패"를 명시할 수 있게 한다(데이터 없음과 조회 실패를 혼동하지 않음).
  firebaseError: boolean;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProvider(value: unknown): value is CustomerProvider {
  return (
    value === null ||
    value === "local" ||
    value === "google" ||
    value === "kakao" ||
    value === "naver"
  );
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function isCustomerSummary(value: unknown): value is CustomerSummary {
  if (!isPlainObject(value)) {
    return false;
  }
  return (
    typeof value.userId === "string" &&
    (value.name === null || typeof value.name === "string") &&
    (value.loginId === null || typeof value.loginId === "string") &&
    isProvider(value.provider) &&
    typeof value.createdAt === "string" &&
    isCount(value.reservationCount) &&
    isCount(value.activeFavoriteCount)
  );
}

function isReservationSummary(
  value: unknown,
): value is CustomerReservationSummary {
  if (!isPlainObject(value)) {
    return false;
  }
  return (
    isCount(value.total) &&
    isCount(value.reserved) &&
    isCount(value.cancelled) &&
    isCount(value.used)
  );
}

export function isCustomerDetail(value: unknown): value is CustomerDetail {
  if (!isPlainObject(value)) {
    return false;
  }
  const profileOk =
    value.profile === null ||
    (isPlainObject(value.profile) &&
      isProvider(value.profile.provider) &&
      typeof value.profile.reservationNotificationsEnabled === "boolean");
  const firebaseOk =
    value.firebase === null ||
    (isPlainObject(value.firebase) &&
      (value.firebase.email === null ||
        typeof value.firebase.email === "string"));

  return (
    typeof value.userId === "string" &&
    profileOk &&
    isReservationSummary(value.reservations) &&
    isCount(value.activeFavoriteCount) &&
    firebaseOk &&
    typeof value.firebaseError === "boolean"
  );
}
