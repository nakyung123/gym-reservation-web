"use client";

import { useState } from "react";

/**
 * 아이디·이메일 "중복 확인" 같은 가용성 검사의 상태머신을 공통화하는 훅.
 *
 * 회원가입 폼은 로그인 아이디와 이메일에 대해 사실상 동일한 검사 흐름을 두 번
 * 복붙하고 있었다: 사전 검증 → checking → 서버 조회 → available/taken/invalid/error.
 * 이 훅으로 상태머신과 실행 절차를 한곳에 모으고, 값마다 다른 부분(사전 검증·조회
 * 함수·invalid 문구)만 run()의 인자로 받는다.
 */
export type AvailabilityState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available" }
  | { status: "taken" }
  // 형식이 잘못됨. message는 값에 따라 있을 수도(아이디) 없을 수도(이메일) 있다.
  | { status: "invalid"; message?: string }
  | { status: "error"; message: string };

/** 서버 가용성 조회 결과 계약(login-id/email client 공통 형태). */
type AvailabilityResult =
  | { ok: false; message: string }
  | { ok: true; available: true }
  | { ok: true; available: false; reason?: string };

type RunOptions = {
  /** 사전 형식 검증. 통과 시 서버로 보낼 값을, 실패 시 표시 문구를 돌려준다. */
  validate: () =>
    | { ok: true; value: string }
    | { ok: false; message?: string };
  /** 검증된 값으로 서버 가용성을 조회한다. */
  fetcher: (value: string) => Promise<AvailabilityResult>;
  /** 서버가 reason:"invalid"를 돌려줄 때 표시할 문구(없으면 문구 없이 invalid). */
  invalidMessage?: string;
};

export function useAvailabilityCheck() {
  const [state, setState] = useState<AvailabilityState>({ status: "idle" });

  /** 입력이 바뀌어 직전 결과를 무효화할 때 호출한다. */
  const reset = () => setState({ status: "idle" });

  /**
   * 확인 이후(예: 제출 시점)에 서버가 "이미 사용 중"으로 판정한 경우처럼,
   * run()을 거치지 않고 taken으로 되돌려야 할 때 사용한다.
   */
  const markTaken = () => setState({ status: "taken" });

  const run = async ({ validate, fetcher, invalidMessage }: RunOptions) => {
    const validation = validate();
    if (!validation.ok) {
      setState({ status: "invalid", message: validation.message });
      return;
    }
    setState({ status: "checking" });
    const result = await fetcher(validation.value);
    if (!result.ok) {
      setState({ status: "error", message: result.message });
      return;
    }
    if (result.available) {
      setState({ status: "available" });
      return;
    }
    setState(
      result.reason === "invalid"
        ? { status: "invalid", message: invalidMessage }
        : { status: "taken" },
    );
  };

  return { state, run, reset, markTaken };
}
