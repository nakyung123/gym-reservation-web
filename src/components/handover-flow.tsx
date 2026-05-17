"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  finalizeKakaoHandover,
  retryKakaoFinalize,
  type FinalizeKakaoResult,
} from "@/lib/firebase-kakao-auth";
import {
  finalizeNaverHandover,
  retryNaverFinalize,
  type FinalizeNaverResult,
} from "@/lib/firebase-naver-auth";
import { ensureUserProfile } from "@/lib/user-profile-client";

type Provider = "kakao" | "naver";

const PROVIDER_LABEL: Record<Provider, string> = {
  kakao: "카카오",
  naver: "네이버",
};

type FinalizeResult = FinalizeKakaoResult | FinalizeNaverResult;

type FlowState =
  | { kind: "loading"; ticketId: string }
  | {
      kind: "error";
      message: string;
      retryable: boolean;
      ticketId: string | null;
    }
  | { kind: "success" };

const PANEL_BASE =
  "w-full rounded-lg border bg-white p-6 shadow-sm text-slate-950";

export function HandoverFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const provider = readProvider(searchParams);
  const providerLabel = PROVIDER_LABEL[provider];
  const [state, setState] = useState<FlowState>(() => initialState(searchParams));
  const startedRef = useRef(false);

  function handleResult(result: FinalizeResult) {
    if (result.ok) {
      setState({ kind: "success" });
      // provider 동기화 + UserProfile 보장. 실패해도 본 흐름은 계속.
      void ensureUserProfile().catch((error) => {
        console.warn("[handover] ensureUserProfile failed:", error);
      });
      setTimeout(() => router.replace("/mypage"), 1200);
      return;
    }
    if (result.reason === "retryable") {
      setState({
        kind: "error",
        message: result.message,
        retryable: true,
        ticketId: result.ticketId ?? null,
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
    const result =
      provider === "kakao"
        ? await finalizeKakaoHandover({ ticketId })
        : await finalizeNaverHandover({ ticketId });
    handleResult(result);
  }

  async function runRetry(ticketId: string) {
    setState({ kind: "loading", ticketId });
    const result =
      provider === "kakao"
        ? await retryKakaoFinalize({ ticketId })
        : await retryNaverFinalize({ ticketId });
    handleResult(result);
  }

  useEffect(() => {
    if (startedRef.current) return;
    if (state.kind !== "loading") return;
    startedRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void runFirst(state.ticketId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.kind === "loading") {
    return (
      <section
        className={`${PANEL_BASE} border-slate-200 text-center`}
        aria-busy="true"
      >
        <p className="text-sm font-semibold text-sky-700">로그인 처리</p>
        <h1 className="mt-2 text-xl font-bold">
          {`${providerLabel} 계정으로 로그인하고 있습니다`}
        </h1>
        <div className="mt-6 flex justify-center" aria-hidden="true">
          <span className="size-8 animate-spin rounded-full border-2 border-slate-200 border-t-sky-600" />
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
              onClick={() => runRetry(state.ticketId as string)}
              className="inline-flex h-10 items-center justify-center rounded-md bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
            >
              다시 시도
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => router.replace("/login")}
            className="inline-flex h-10 items-center justify-center rounded-md border border-rose-300 bg-white px-4 text-sm font-semibold text-rose-700 transition hover:border-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
          >
            로그인 페이지로
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
      <h1 className="mt-2 text-xl font-bold">{`${providerLabel} 계정으로 로그인했습니다`}</h1>
      <p className="mt-3 text-xs text-emerald-800">
        잠시 후 마이페이지로 이동합니다.
      </p>
    </section>
  );
}

function readProvider(searchParams: URLSearchParams): Provider {
  const value = searchParams.get("provider");
  return value === "naver" ? "naver" : "kakao";
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
