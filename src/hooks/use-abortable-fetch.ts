"use client";

import { useEffect, useState } from "react";
import { getErrorMessage, isAbortError } from "@/lib/async-error";

/**
 * client helper(fetch) 결과를 화면 상태머신으로 바꿔주는 공통 훅.
 *
 * 저장소의 client helper 계약(ok: true/false + message [+ status])을 그대로 따른다.
 * 기존에는 화면마다 아래 4종 세트를 복붙했다:
 *   AbortController 생성 → helper 호출 → ok 분기 setState → cleanup abort
 * (mypage 문의 패널, reservation-form 프로필 로드, admin 뷰 전반)
 *
 * 실패는 반드시 error 상태로 노출한다(No Silent Fallback).
 */
export type FetchState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; message: string; responseStatus?: number };

type HelperResult<T> =
  | ({ ok: true } & T)
  | { ok: false; message: string; status?: number };

/**
 * @param fetcher deps가 바뀔 때마다 재실행되는 로더. signal을 반드시 helper에 전달할 것.
 * @param deps    재조회 트리거 (page, userId, 필터 등)
 */
export function useAbortableFetch<T>(
  fetcher: (signal: AbortSignal) => Promise<HelperResult<T>>,
  deps: readonly unknown[],
): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({ status: "loading" });

  /* eslint-disable react-hooks/set-state-in-effect -- 외부 fetch 동기화 목적의 의도적 set */
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetcher(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.ok) {
          // ok 플래그를 떼고 나머지 페이로드만 data로 노출한다.
          const { ok, ...data } = result;
          void ok;
          setState({ status: "ready", data: data as T });
          return;
        }
        setState({
          status: "error",
          message: result.message,
          responseStatus: result.status,
        });
      })
      .catch((error) => {
        if (isAbortError(error) || controller.signal.aborted) return;
        setState({ status: "error", message: getErrorMessage(error) });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps는 호출부가 명시적으로 관리한다
  }, deps);
  /* eslint-enable react-hooks/set-state-in-effect */

  return state;
}
