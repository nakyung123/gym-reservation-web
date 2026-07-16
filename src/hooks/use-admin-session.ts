"use client";

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseClient } from "@/lib/firebase-client";

/**
 * 관리자 콘솔의 세션 상태(로그인 여부 + admin 커스텀 클레임)를 구독한다.
 *
 * 서버는 `/api/admin/*`에서 ID token을 verify하고 `admin === true`를 다시 검증한다(SSOT).
 * 이 훅이 읽는 클레임은 **화면 분기용**이며 권한 판단의 근거가 아니다.
 * (여기서 admin으로 보여도 서버가 거부하면 API는 403으로 실패한다.)
 */
export type AdminSessionState =
  | { status: "checking" }
  | { status: "signed-out" }
  | { status: "not-admin"; email: string | null }
  | { status: "admin"; email: string | null };

async function resolveClaim(user: User): Promise<AdminSessionState> {
  try {
    // 클레임이 방금 부여된 계정은 캐시된 토큰에 admin이 없을 수 있어 강제 갱신한다.
    const token = await user.getIdTokenResult(true);
    const isAdmin = token.claims.admin === true;
    return isAdmin
      ? { status: "admin", email: user.email }
      : { status: "not-admin", email: user.email };
  } catch {
    // 토큰을 못 가져오면 권한을 확인할 수 없다. 통과시키지 않는다(fail-closed).
    return { status: "not-admin", email: user.email };
  }
}

export function useAdminSession() {
  const [state, setState] = useState<AdminSessionState>({ status: "checking" });
  // 로그인 성공 직후 onAuthStateChanged를 기다리지 않고 즉시 다시 확인하기 위한 nonce.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const { auth } = getFirebaseClient();
    let cancelled = false;

    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (cancelled) return;
        if (!user) {
          setState({ status: "signed-out" });
          return;
        }
        void resolveClaim(user).then((next) => {
          if (!cancelled) setState(next);
        });
      },
      () => {
        if (!cancelled) setState({ status: "signed-out" });
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [reloadKey]);

  // 로그인 성공 후 호출해 클레임을 다시 읽는다.
  const refresh = useCallback(() => {
    setState({ status: "checking" });
    setReloadKey((key) => key + 1);
  }, []);

  return { state, refresh };
}
