"use client";

import Link from "next/link";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  reservationStatusBadgeStyles,
  reservationStatusLabel,
} from "@/components/reservation-ticket";
import { getFirebaseClient } from "@/lib/firebase-client";
import {
  fetchUserSummary,
  type FetchUserSummaryResult,
} from "@/lib/user-summary-client";
import type { UserSummary } from "@/lib/user-summary";
import type { ReservationStatus } from "@/types/domain";

type AuthState =
  | { status: "loading" }
  | { status: "ready"; user: User }
  | { status: "signed-out" }
  | { status: "error"; message: string };

type SummaryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; summary: UserSummary }
  | {
      status: "error";
      kind: Exclude<FetchUserSummaryResult, { ok: true }>["kind"];
      message: string;
      responseStatus?: number;
    };

type NoticeState = {
  tone: "success" | "error";
  message: string;
};

const summaryStatusOrder: ReservationStatus[] = [
  "reserved",
  "cancelled",
  "used",
];

const metricToneStyles = {
  slate: "border-slate-200 bg-white text-slate-950",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
  rose: "border-rose-200 bg-rose-50 text-rose-800",
  sky: "border-sky-200 bg-sky-50 text-sky-800",
};

const noticeStyles: Record<NoticeState["tone"], string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-rose-200 bg-rose-50 text-rose-800",
};

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "알 수 없는 오류가 발생했습니다.";
}

function getAccountName(user: User): string {
  const displayName = user.displayName?.trim();
  if (displayName) {
    return displayName;
  }

  if (user.email) {
    return user.email.split("@")[0] || user.email;
  }

  return user.isAnonymous ? "익명 사용자" : "이름 없음";
}

function getInitial(user: User): string {
  const source = getAccountName(user) || user.email || user.uid;
  return source.trim().charAt(0).toUpperCase() || "U";
}

function getProfileImageStyle(
  photoURL: string | null,
): CSSProperties | undefined {
  if (!photoURL) {
    return undefined;
  }

  return {
    backgroundImage: `url(${JSON.stringify(photoURL)})`,
  };
}

function formatUserId(uid: string): string {
  if (uid.length <= 16) {
    return uid;
  }

  return `${uid.slice(0, 8)}...${uid.slice(-4)}`;
}

function LoadingPanel() {
  return (
    <section
      className="mx-auto w-full max-w-4xl rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm"
      aria-live="polite"
      aria-busy="true"
    >
      <p className="text-sm font-semibold text-sky-700">내 정보</p>
      <h1 className="mt-2 break-keep text-2xl font-bold text-slate-950 sm:text-3xl">
        로그인 정보를 확인하고 있습니다
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        현재 브라우저에 연결된 Firebase 계정을 확인하는 중입니다.
      </p>
      <div className="mt-6 flex justify-center" aria-hidden="true">
        <span className="size-8 animate-spin rounded-full border-2 border-slate-200 border-t-sky-600" />
      </div>
    </section>
  );
}

function ErrorPanel({ title, message }: { title: string; message: string }) {
  return (
    <section
      className="mx-auto w-full max-w-4xl rounded-lg border border-rose-200 bg-rose-50 p-8 text-center text-rose-800 shadow-sm"
      role="alert"
    >
      <p className="text-sm font-semibold">내 정보</p>
      <h1 className="mt-2 break-keep text-2xl font-bold sm:text-3xl">
        {title}
      </h1>
      <p className="mt-3 text-sm leading-6">{message}</p>
    </section>
  );
}

function SignedOutPanel() {
  return (
    <section className="mx-auto w-full max-w-4xl rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
      <p className="text-sm font-semibold text-sky-700">내 정보</p>
      <h1 className="mt-2 break-keep text-2xl font-bold text-slate-950 sm:text-3xl">
        로그인이 필요합니다
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        계정 정보와 예약 요약을 보려면 Firebase 로그인 세션이 필요합니다.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link
          href="/gyms"
          className="inline-flex h-11 items-center justify-center rounded-md bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
        >
          체육관 보기
        </Link>
        <Link
          href="/reservations"
          className="inline-flex h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-800 transition hover:border-sky-400 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
        >
          내 예약 보기
        </Link>
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  caption,
  tone = "slate",
}: {
  label: string;
  value: number | string;
  caption?: string;
  tone?: keyof typeof metricToneStyles;
}) {
  return (
    <div className={`rounded-lg border p-4 shadow-sm ${metricToneStyles[tone]}`}>
      <p className="text-sm font-semibold opacity-75">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
      {caption ? (
        <p className="mt-2 text-xs font-semibold opacity-70">{caption}</p>
      ) : null}
    </div>
  );
}

function LoadingMetricCard({ label }: { label: string }) {
  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      aria-busy="true"
    >
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <div className="mt-3 h-8 w-16 rounded bg-slate-100" aria-hidden="true" />
      <p className="mt-3 text-xs font-semibold text-slate-400">조회 중</p>
    </div>
  );
}

function SummaryPanel({ summaryState }: { summaryState: SummaryState }) {
  if (summaryState.status === "loading" || summaryState.status === "idle") {
    return (
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <LoadingMetricCard label="전체 예약" />
        {summaryStatusOrder.map((status) => (
          <LoadingMetricCard
            key={status}
            label={reservationStatusLabel[status]}
          />
        ))}
        <LoadingMetricCard label="즐겨찾기" />
      </section>
    );
  }

  if (summaryState.status === "error") {
    const detail =
      summaryState.responseStatus === undefined
        ? summaryState.message
        : `${summaryState.message} status=${summaryState.responseStatus}`;

    return (
      <section
        className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-rose-800 shadow-sm"
        role="alert"
      >
        <p className="text-sm font-bold">요약 정보를 불러오지 못했습니다</p>
        <p className="mt-2 text-sm leading-6">{detail}</p>
      </section>
    );
  }

  const { summary } = summaryState;
  const hasNoData =
    summary.reservations.total === 0 && summary.favorites.activeGymCount === 0;

  return (
    <section className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          label="전체 예약"
          value={summary.reservations.total}
          caption="누적"
        />
        <MetricCard
          label={reservationStatusLabel.reserved}
          value={summary.reservations.reserved}
          tone="emerald"
        />
        <MetricCard
          label={reservationStatusLabel.cancelled}
          value={summary.reservations.cancelled}
          tone="rose"
        />
        <MetricCard
          label={reservationStatusLabel.used}
          value={summary.reservations.used}
          tone="sky"
        />
        <MetricCard
          label="즐겨찾기"
          value={summary.favorites.activeGymCount}
          caption="운영 중인 체육관"
        />
      </div>

      {hasNoData ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm">
          <p className="text-base font-bold text-slate-950">
            아직 예약과 즐겨찾기가 없습니다
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            이용할 체육관을 찾으면 예약 내역과 즐겨찾기 요약이 이곳에 쌓입니다.
          </p>
          <Link
            href="/gyms"
            className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
          >
            체육관 찾기
          </Link>
        </div>
      ) : null}
    </section>
  );
}

function StatusBreakdown({ summaryState }: { summaryState: SummaryState }) {
  if (summaryState.status !== "ready") {
    return null;
  }

  const { reservations } = summaryState.summary;

  return (
    <div className="flex flex-wrap gap-2">
      {summaryStatusOrder.map((status) => (
        <span
          key={status}
          className={`rounded-md px-2.5 py-1 text-xs font-bold ${reservationStatusBadgeStyles[status]}`}
        >
          {reservationStatusLabel[status]} {reservations[status]}건
        </span>
      ))}
    </div>
  );
}

export function MypageView() {
  const [authState, setAuthState] = useState<AuthState>({ status: "loading" });
  const [summaryState, setSummaryState] = useState<SummaryState>({
    status: "idle",
  });
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const readyUserId =
    authState.status === "ready" ? authState.user.uid : null;

  useEffect(() => {
    try {
      const { auth } = getFirebaseClient();

      return onAuthStateChanged(
        auth,
        (user) => {
          setNotice(null);
          setSummaryState(user ? { status: "loading" } : { status: "idle" });
          setAuthState(
            user ? { status: "ready", user } : { status: "signed-out" },
          );
        },
        (error) => {
          setAuthState({
            status: "error",
            message: `로그인 상태를 확인하지 못했습니다. ${getErrorMessage(error)}`,
          });
        },
      );
    } catch (error) {
      queueMicrotask(() => {
        setAuthState({
          status: "error",
          message: `로그인 상태를 확인하지 못했습니다. ${getErrorMessage(error)}`,
        });
      });
    }
  }, []);

  useEffect(() => {
    if (!readyUserId) {
      return;
    }

    const controller = new AbortController();

    fetchUserSummary(controller.signal)
      .then((result) => {
        if (result.ok) {
          if (result.user.uid !== readyUserId) {
            return;
          }
          setSummaryState({ status: "ready", summary: result.summary });
          return;
        }

        setSummaryState({
          status: "error",
          kind: result.kind,
          message: result.message,
          responseStatus: result.status,
        });
      })
      .catch((error) => {
        if (isAbortError(error)) {
          return;
        }

        setSummaryState({
          status: "error",
          kind: "error",
          message: `내 정보 요약 처리 중 오류가 발생했습니다. ${getErrorMessage(error)}`,
        });
      });

    return () => controller.abort();
  }, [readyUserId]);

  const account = useMemo(() => {
    if (authState.status !== "ready") {
      return null;
    }

    const { user } = authState;
    return {
      displayName: getAccountName(user),
      email: user.email ?? "등록된 이메일 없음",
      initial: getInitial(user),
      isAnonymous: user.isAnonymous,
      photoURL: user.photoURL,
      uid: user.uid,
    };
  }, [authState]);

  const handleSignOut = async () => {
    setNotice(null);
    setIsSigningOut(true);

    try {
      const { auth } = getFirebaseClient();
      await signOut(auth);
      setNotice({ tone: "success", message: "로그아웃했습니다." });
    } catch (error) {
      setNotice({
        tone: "error",
        message: `로그아웃하지 못했습니다. ${getErrorMessage(error)}`,
      });
    } finally {
      setIsSigningOut(false);
    }
  };

  if (authState.status === "loading") {
    return <LoadingPanel />;
  }

  if (authState.status === "error") {
    return (
      <ErrorPanel
        title="로그인 정보를 확인하지 못했습니다"
        message={authState.message}
      />
    );
  }

  if (authState.status === "signed-out" || !account) {
    return <SignedOutPanel />;
  }

  const profileImageStyle = getProfileImageStyle(account.photoURL);

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-sky-700">내 정보</p>
        <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <span
              className="flex size-16 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 bg-cover bg-center text-xl font-bold text-slate-700"
              style={profileImageStyle}
              role="img"
              aria-label={`${account.displayName} 프로필 이미지`}
            >
              {account.photoURL ? null : account.initial}
            </span>
            <div className="min-w-0">
              <h1 className="break-words text-3xl font-bold text-slate-950">
                {account.displayName}
              </h1>
              <p className="mt-1 break-all text-sm text-slate-600">
                {account.email}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {account.isAnonymous ? (
                  <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                    익명 계정
                  </span>
                ) : null}
                <span className="rounded-md bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700">
                  UID {formatUserId(account.uid)}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="inline-flex h-10 w-fit shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-rose-300 hover:text-rose-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
          >
            {isSigningOut ? "로그아웃 중" : "로그아웃"}
          </button>
        </div>

        {notice ? (
          <div
            className={`mt-5 rounded-md border px-4 py-3 text-sm font-semibold ${noticeStyles[notice.tone]}`}
            role={notice.tone === "error" ? "alert" : "status"}
          >
            {notice.message}
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-sky-700">활동 요약</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">
              예약과 즐겨찾기 현황
            </h2>
          </div>
          <StatusBreakdown summaryState={summaryState} />
        </div>

        <SummaryPanel summaryState={summaryState} />
      </section>
    </section>
  );
}
