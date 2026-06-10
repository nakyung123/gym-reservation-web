import "server-only";
import type { CustomerFirebaseMeta } from "@/lib/admin/customer";
import { getAdminAuth } from "@/lib/server/firebase-admin";

// Firebase Auth 사용자 메타(email/최근 로그인/가입 시각/provider) 조회.
//
// 정책:
// - 사용자가 Firebase에 없으면(null이 아니라 명시적으로) null을 반환한다.
// - 그 외 오류(자격 누락, 네트워크 등)는 throw해서 호출 측(상세 라우트)이 firebaseError로
//   표면화한다. "데이터 없음"과 "조회 실패"를 혼동하지 않기 위함(No Silent Fallback).
// - 비밀값(서비스 계정 자격)은 로그/응답에 노출하지 않는다.

function toIsoOrNull(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) {
    return null;
  }
  return new Date(time).toISOString();
}

function isUserNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "auth/user-not-found"
  );
}

export async function getFirebaseUserMeta(
  uid: string,
): Promise<CustomerFirebaseMeta | null> {
  try {
    const user = await getAdminAuth().getUser(uid);
    return {
      email: user.email ?? null,
      emailVerified: user.emailVerified,
      disabled: user.disabled,
      creationTime: toIsoOrNull(user.metadata.creationTime),
      lastSignInTime: toIsoOrNull(user.metadata.lastSignInTime),
      providers: user.providerData.map((provider) => provider.providerId),
    };
  } catch (error) {
    if (isUserNotFound(error)) {
      return null;
    }
    throw error;
  }
}
