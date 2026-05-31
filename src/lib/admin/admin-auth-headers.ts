"use client";

import { onAuthStateChanged, type Auth, type User } from "firebase/auth";
import { getFirebaseClient } from "@/lib/firebase-client";

// 관리자 API(/api/admin/*)는 Authorization: Bearer <Firebase ID token>으로 인증한다.
// 서버에서 verifyIdToken + custom claim admin === true 검증을 수행하므로,
// 클라이언트는 단순히 현재 로그인된 Firebase user의 ID token을 첨부하기만 한다.
//
// 미로그인 / Firebase user 부재 시에는 호출 자체를 막아 명시적 에러로 반환한다.
// (UI 컴포넌트는 보통 로그인 가드 뒤에 있지만, race condition으로 currentUser가
//  사라진 직후 호출되는 경우를 방어한다.)

export type AdminAuthHeaderResult =
  | { ok: true; headers: { Authorization: string } }
  | { ok: false; message: string };

const AUTH_STATE_WAIT_TIMEOUT_MS = 1500;

function waitForResolvedUser(auth: Auth): Promise<User | null> {
  if (auth.currentUser) {
    return Promise.resolve(auth.currentUser);
  }

  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (user: User | null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      unsubscribe?.();
      resolve(user);
    };

    timer = setTimeout(() => {
      finish(null);
    }, AUTH_STATE_WAIT_TIMEOUT_MS);

    unsubscribe = onAuthStateChanged(
      auth,
      (user) => finish(user),
      () => finish(null),
    );

    if (settled) {
      unsubscribe();
    }
  });
}

export async function getAdminAuthHeader(): Promise<AdminAuthHeaderResult> {
  const { auth } = getFirebaseClient();
  const user = await waitForResolvedUser(auth);
  if (!user) {
    return {
      ok: false,
      message: "관리자 기능을 사용하려면 먼저 로그인해 주세요.",
    };
  }

  let idToken: string;
  try {
    idToken = await user.getIdToken();
  } catch {
    return {
      ok: false,
      message: "관리자 인증 토큰을 가져오지 못했습니다. 다시 로그인해 주세요.",
    };
  }

  return {
    ok: true,
    headers: { Authorization: `Bearer ${idToken}` },
  };
}
