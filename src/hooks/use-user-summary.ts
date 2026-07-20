"use client";

import { useEffect, useState } from "react";
import { fetchUserSummary } from "@/lib/user-summary-client";
import type { UserSummary } from "@/lib/user-summary";

type SummaryState =
  | { status: "loading" }
  | { status: "ready"; summary: UserSummary }
  | { status: "failed"; message: string };

export type UserSummaryResult = {
  /** 로드된 요약. 아직 로딩 중이거나 실패했으면 null. */
  summary: UserSummary | null;
  /** 실패 메시지. 없으면 null. 조용한 폴백 대신 호출부가 표시할 수 있게 노출한다. */
  loadError: string | null;
  /** 첫 응답(성공·실패)이 아직 도착하지 않은 상태. */
  pending: boolean;
};

/**
 * 내 정보 요약(GET /api/me)을 한 번 조회하는 훅.
 *
 * 예약 상태별 집계·즐겨찾기 수·시설별 예약 횟수처럼 **서버가 세는 편이 나은 값**을 받는다.
 * 예약 목록 전체를 받아 클라이언트에서 세면 사용자의 누적 예약에 비례해 응답이 커지므로,
 * 집계는 이 경로로 분리한다.
 *
 * 인증 전이면 auth-required가 오는데, 이는 오류가 아니라 정상 상태라 메시지를 띄우지 않는다
 * (마이페이지는 별도 인증 게이트가 앞단에서 처리한다).
 */
export function useUserSummary(): UserSummaryResult {
  const [state, setState] = useState<SummaryState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    void fetchUserSummary(controller.signal).then((result) => {
      if (!active) return;
      if (result.ok) {
        setState({ status: "ready", summary: result.summary });
        return;
      }
      if (result.kind === "auth-required") {
        setState({ status: "loading" });
        return;
      }
      setState({ status: "failed", message: result.message });
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  return {
    summary: state.status === "ready" ? state.summary : null,
    loadError: state.status === "failed" ? state.message : null,
    pending: state.status === "loading",
  };
}
