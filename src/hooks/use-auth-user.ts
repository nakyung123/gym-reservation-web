"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { useEffect, useState } from "react";
import { getFirebaseClient } from "@/lib/firebase-client";
import { getErrorMessage } from "@/lib/async-error";

/**
 * Firebase 로그인 상태를 화면 상태머신으로 노출하는 공통 훅.
 *
 * 기존에는 화면마다 onAuthStateChanged 구독 + 해제 + 오류 처리 보일러플레이트를
 * 복붙했다(mypage-view, password-change-view 등). 이 훅으로 수렴한다.
 *
 * 상태 의미:
 * - loading    : 초기 세션 복원 중 (스피너 노출 구간)
 * - ready      : 로그인됨. user 사용 가능
 * - signed-out : 미로그인 (리다이렉트는 useRequireAuth 책임 — 여기서 하지 않음)
 * - error      : Firebase 초기화/구독 실패. 숨기지 않고 그대로 노출한다(No Silent Fallback)
 *
 * 계정 전환 시 파생 상태 리셋(폼 초기화, 진행 중 요청 abort 등)은 이 훅이 아니라
 * 소비자 쪽에서 `state.status === "ready" ? state.user.uid : null` 값 변화에
 * 반응해 처리한다(화면마다 리셋 대상이 다르므로 여기 뭉치지 않는다).
 */
export type AuthUserState =
  | { status: "loading" }
  | { status: "ready"; user: User }
  | { status: "signed-out" }
  | { status: "error"; message: string };

export function useAuthUser(): AuthUserState {
  const [state, setState] = useState<AuthUserState>({ status: "loading" });

  useEffect(() => {
    try {
      const { auth } = getFirebaseClient();
      return onAuthStateChanged(
        auth,
        (user) =>
          setState(user ? { status: "ready", user } : { status: "signed-out" }),
        (error) =>
          setState({
            status: "error",
            message: `로그인 상태를 확인하지 못했습니다. ${getErrorMessage(error)}`,
          }),
      );
    } catch (error) {
      // getFirebaseClient 자체가 던진 경우(설정 오류 등). effect 본문에서
      // 곧바로 setState하지 않는 규칙을 지키기 위해 마이크로태스크로 미룬다.
      queueMicrotask(() =>
        setState({
          status: "error",
          message: `로그인 상태를 확인하지 못했습니다. ${getErrorMessage(error)}`,
        }),
      );
    }
  }, []);

  return state;
}
