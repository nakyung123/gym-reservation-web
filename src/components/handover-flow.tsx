"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  finalizeKakaoHandover,
  retryKakaoFinalize,
} from "@/lib/firebase-kakao-auth";

type FlowState =
  | { kind: "loading"; ticketId: string }
  | { kind: "confirm-required"; ticketId: string }
  | { kind: "confirming"; ticketId: string }
  | {
      kind: "error";
      message: string;
      retryable: boolean;
      ticketId: string | null;
    }
  | { kind: "success"; transferred: boolean };

const PANEL_BASE =
  "w-full rounded-lg border bg-white p-6 shadow-sm text-slate-950";

export function HandoverFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<FlowState>(() => initialState(searchParams));
  const startedRef = useRef(false);

  function handleResult(
    result: Awaited<ReturnType<typeof finalizeKakaoHandover>>,
  ) {
    if (result.ok) {
      setState({ kind: "success", transferred: result.transferred });
      setTimeout(() => router.replace("/mypage"), 1200);
      return;
    }
    if (result.reason === "confirm-required") {
      setState({ kind: "confirm-required", ticketId: result.ticketId });
      return;
    }
    if (result.reason === "conflict") {
      setState({
        kind: "error",
        message: result.message,
        retryable: true,
        ticketId: result.ticketId,
      });
      return;
    }
    setState({
      kind: "error",
      message: result.message,
      retryable: false,
      ticketId: null,
    });
  }

  async function runFirst(ticketId: string) {
    setState({ kind: "loading", ticketId });
    handleResult(await finalizeKakaoHandover({ ticketId }));
  }

  async function runRetry(ticketId: string, confirmed: boolean) {
    setState({
      kind: confirmed ? "confirming" : "loading",
      ticketId,
    });
    handleResult(await retryKakaoFinalize({ ticketId, confirmed }));
  }

  useEffect(() => {
    if (startedRef.current) return;
    if (state.kind !== "loading") return;
    startedRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void runFirst(state.ticketId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.kind === "loading" || state.kind === "confirming") {
    return (
      <section
        className={`${PANEL_BASE} border-slate-200 text-center`}
        aria-busy="true"
      >
        <p className="text-sm font-semibold text-sky-700">로그인 처리</p>
        <h1 className="mt-2 text-xl font-bold">
          {state.kind === "confirming"
            ? "기존 카카오 계정으로 로그인하고 있습니다"
            : "로그인 정보를 확인하고 있습니다"}
        </h1>
        <div className="mt-6 flex justify-center" aria-hidden="true">
          <span className="size-8 animate-spin rounded-full border-2 border-slate-200 border-t-sky-600" />
        </div>
      </section>
    );
  }

  if (state.kind === "confirm-required") {
    return (
      <section
        className={`${PANEL_BASE} border-sky-200`}
        role="alertdialog"
        aria-labelledby="handover-confirm-title"
      >
        <p className="text-sm font-semibold text-sky-700">로그인 확인</p>
        <h1
          id="handover-confirm-title"
          className="mt-2 text-xl font-bold"
        >
          기존 카카오 계정으로 로그인하시겠어요?
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-700">
          이 카카오 계정으로 이미 가입된 계정이 있습니다. 기존 계정으로 로그인하면
          현재 임시 계정의 활동 기록은 사용할 수 없게 됩니다.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => runRetry(state.ticketId, true)}
            className="inline-flex h-10 items-center justify-center rounded-md bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
          >
            기존 카카오 계정으로 로그인
          </button>
          <button
            type="button"
            onClick={() => router.replace("/mypage")}
            className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
          >
            취소
          </button>
        </div>
      </section>
    );
  }

  if (state.kind === "error") {
    return (
      <section
        className={`${PANEL_BASE} border-rose-200 bg-rose-50 text-rose-900`}
        role="alert"
      >
        <p className="text-sm font-semibold">로그인 실패</p>
        <h1 className="mt-2 text-xl font-bold">로그인을 완료하지 못했습니다</h1>
        <p className="mt-3 text-sm leading-6">{state.message}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {state.retryable && state.ticketId ? (
            <button
              type="button"
              onClick={() => runRetry(state.ticketId as string, false)}
              className="inline-flex h-10 items-center justify-center rounded-md bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
            >
              다시 시도
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => router.replace("/mypage")}
            className="inline-flex h-10 items-center justify-center rounded-md border border-rose-300 bg-white px-4 text-sm font-semibold text-rose-700 transition hover:border-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
          >
            마이페이지로
          </button>
        </div>
      </section>
    );
  }

  // success
  return (
    <section
      className={`${PANEL_BASE} border-emerald-200 bg-emerald-50 text-emerald-900 text-center`}
      role="status"
    >
      <p className="text-sm font-semibold">로그인 완료</p>
      <h1 className="mt-2 text-xl font-bold">카카오 계정으로 로그인했습니다</h1>
      <p className="mt-3 text-sm leading-6">
        {state.transferred
          ? "임시 계정의 활동을 새 계정으로 이전했습니다."
          : "기존 계정으로 다시 로그인했습니다."}
      </p>
      <p className="mt-3 text-xs text-emerald-800">
        잠시 후 마이페이지로 이동합니다.
      </p>
    </section>
  );
}

function initialState(searchParams: URLSearchParams): FlowState {
  const errorCode = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const ticket = searchParams.get("ticket");

  if (errorCode) {
    return {
      kind: "error",
      message: errorDescription ?? errorCode,
      retryable: false,
      ticketId: null,
    };
  }
  if (!ticket) {
    return {
      kind: "error",
      message: "ticket이 누락됐습니다.",
      retryable: false,
      ticketId: null,
    };
  }
  return { kind: "loading", ticketId: ticket };
}
