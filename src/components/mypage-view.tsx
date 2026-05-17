"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  reservationStatusBadgeStyles,
  reservationStatusLabel,
} from "@/components/reservation-ticket";
import { SPORTS } from "@/lib/domain-constants";
import { resendEmailVerification } from "@/lib/firebase-email-auth";
import { getFirebaseClient } from "@/lib/firebase-client";
import { checkNicknameAvailability } from "@/lib/nickname-availability-client";
import {
  fetchUserProfile,
  saveUserProfile,
  type FetchUserProfileResult,
  type SaveUserProfileResult,
} from "@/lib/user-profile-client";
import type { UserProfile } from "@/lib/user-profile";
import {
  fetchUserSummary,
  type FetchUserSummaryResult,
} from "@/lib/user-summary-client";
import type { UserSummary } from "@/lib/user-summary";
import type { ReservationStatus, Sport } from "@/types/domain";

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

type ProfileFormState = {
  nickname: string;
  preferredRegion: string;
  preferredSports: Sport[];
  reservationNotificationsEnabled: boolean;
};

type ProfileState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; form: ProfileFormState }
  | {
      status: "error";
      kind: Exclude<FetchUserProfileResult, { ok: true }>["kind"];
      message: string;
      responseStatus?: number;
    };

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "success"; message: string }
  | {
      status: "error";
      kind: Exclude<SaveUserProfileResult, { ok: true }>["kind"];
      message: string;
      responseStatus?: number;
    };

type NoticeState = {
  tone: "success" | "error";
  message: string;
};

const emptyProfileForm: ProfileFormState = {
  nickname: "",
  preferredRegion: "",
  preferredSports: [],
  reservationNotificationsEnabled: true,
};

function profileToForm(profile: UserProfile | null): ProfileFormState {
  if (!profile) {
    return { ...emptyProfileForm, preferredSports: [] };
  }

  return {
    nickname: profile.nickname ?? "",
    preferredRegion: profile.preferredRegion ?? "",
    preferredSports: [...profile.preferredSports],
    reservationNotificationsEnabled: profile.reservationNotificationsEnabled,
  };
}

function formToInput(form: ProfileFormState) {
  const trimmedNickname = form.nickname.trim();
  const trimmedRegion = form.preferredRegion.trim();
  return {
    nickname: trimmedNickname.length === 0 ? null : trimmedNickname,
    preferredRegion: trimmedRegion.length === 0 ? null : trimmedRegion,
    preferredSports: form.preferredSports,
    reservationNotificationsEnabled: form.reservationNotificationsEnabled,
  };
}

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

  return user.isAnonymous ? "임시 계정 사용자" : "이름 없음";
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
        현재 브라우저에 연결된 계정을 확인하는 중입니다.
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
        로그인 페이지로 이동하고 있습니다...
      </p>
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
  const router = useRouter();
  const activeUserIdRef = useRef<string | null>(null);
  const saveAbortControllerRef = useRef<AbortController | null>(null);
  const [authState, setAuthState] = useState<AuthState>({ status: "loading" });
  const [summaryState, setSummaryState] = useState<SummaryState>({
    status: "idle",
  });
  const [profileState, setProfileState] = useState<ProfileState>({
    status: "idle",
  });
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [verificationNotice, setVerificationNotice] = useState<NoticeState | null>(
    null,
  );
  const readyUserId =
    authState.status === "ready" ? authState.user.uid : null;

  useEffect(() => {
    try {
      const { auth } = getFirebaseClient();

      const unsubscribe = onAuthStateChanged(
        auth,
        (user) => {
          activeUserIdRef.current = user?.uid ?? null;
          saveAbortControllerRef.current?.abort();
          saveAbortControllerRef.current = null;
          setSummaryState(user ? { status: "loading" } : { status: "idle" });
          setProfileState(user ? { status: "loading" } : { status: "idle" });
          setSaveState({ status: "idle" });
          setAuthState(
            user ? { status: "ready", user } : { status: "signed-out" },
          );
        },
        (error) => {
          activeUserIdRef.current = null;
          saveAbortControllerRef.current?.abort();
          saveAbortControllerRef.current = null;
          setAuthState({
            status: "error",
            message: `로그인 상태를 확인하지 못했습니다. ${getErrorMessage(error)}`,
          });
        },
      );

      return () => {
        activeUserIdRef.current = null;
        saveAbortControllerRef.current?.abort();
        saveAbortControllerRef.current = null;
        unsubscribe();
      };
    } catch (error) {
      activeUserIdRef.current = null;
      saveAbortControllerRef.current?.abort();
      saveAbortControllerRef.current = null;
      queueMicrotask(() => {
        setAuthState({
          status: "error",
          message: `로그인 상태를 확인하지 못했습니다. ${getErrorMessage(error)}`,
        });
      });
    }
  }, []);

  // signed-out 상태면 /login으로 redirect. Phase C의 useRequireAuth로 추출 예정.
  useEffect(() => {
    if (authState.status === "signed-out") {
      router.replace("/login?from=/mypage");
    }
  }, [authState.status, router]);

  useEffect(() => {
    if (!readyUserId) {
      return;
    }

    const controller = new AbortController();

    fetchUserSummary(controller.signal)
      .then((result) => {
        if (result.ok) {
          if (result.user.uid !== readyUserId) {
            if (activeUserIdRef.current !== readyUserId) {
              return;
            }
            setSummaryState({
              status: "error",
              kind: "error",
              message: "내 정보 요약 응답의 사용자 정보가 현재 로그인 계정과 다릅니다.",
            });
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

  useEffect(() => {
    if (!readyUserId) {
      return;
    }

    const controller = new AbortController();

    fetchUserProfile(controller.signal)
      .then((result) => {
        if (result.ok) {
          if (result.user.uid !== readyUserId) {
            if (activeUserIdRef.current !== readyUserId) {
              return;
            }
            setProfileState({
              status: "error",
              kind: "error",
              message: "프로필 설정 응답의 사용자 정보가 현재 로그인 계정과 다릅니다.",
            });
            return;
          }
          setProfileState({
            status: "ready",
            form: profileToForm(result.profile),
          });
          return;
        }

        setProfileState({
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

        setProfileState({
          status: "error",
          kind: "error",
          message: `프로필 설정을 불러오는 중 오류가 발생했습니다. ${getErrorMessage(error)}`,
        });
      });

    return () => controller.abort();
  }, [readyUserId]);

  const account = useMemo(() => {
    if (authState.status !== "ready") {
      return null;
    }

    const { user } = authState;
    // UserProfile.nickname(SSOT)을 표시명으로 우선 사용한다. 없으면 Firebase displayName으로
    // 폴백. saveUserProfile 직후 profileState가 갱신되면 즉시 반영된다.
    const profileNickname =
      profileState.status === "ready"
        ? profileState.form.nickname.trim() || null
        : null;
    const displayName = profileNickname ?? getAccountName(user);
    return {
      displayName,
      email: user.email ?? "등록된 이메일 없음",
      // password 가입자만 emailVerified를 의미있게 가진다. 소셜 가입자는 provider 측에서
      // 이미 검증되었다고 가정해 배너를 보이지 않는다.
      showVerificationBanner:
        Boolean(user.email) &&
        user.emailVerified === false &&
        user.providerData.some((p) => p.providerId === "password"),
      initial: profileNickname
        ? profileNickname.slice(0, 1).toUpperCase()
        : getInitial(user),
      photoURL: user.photoURL,
      uid: user.uid,
    };
  }, [authState, profileState]);

  const updateProfileForm = (updater: (form: ProfileFormState) => ProfileFormState) => {
    setProfileState((prev) => {
      if (prev.status !== "ready") {
        return prev;
      }
      return { status: "ready", form: updater(prev.form) };
    });
    setSaveState((prev) =>
      prev.status === "idle" ? prev : { status: "idle" },
    );
  };

  const handleNicknameChange = (value: string) => {
    updateProfileForm((form) => ({ ...form, nickname: value }));
  };

  const handlePreferredRegionChange = (value: string) => {
    updateProfileForm((form) => ({ ...form, preferredRegion: value }));
  };

  const handleSportToggle = (sport: Sport, checked: boolean) => {
    updateProfileForm((form) => {
      if (checked) {
        if (form.preferredSports.includes(sport)) {
          return form;
        }
        return { ...form, preferredSports: [...form.preferredSports, sport] };
      }
      return {
        ...form,
        preferredSports: form.preferredSports.filter((item) => item !== sport),
      };
    });
  };

  const handleNotificationsToggle = (checked: boolean) => {
    updateProfileForm((form) => ({
      ...form,
      reservationNotificationsEnabled: checked,
    }));
  };

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (profileState.status !== "ready") {
      return;
    }
    if (!readyUserId) {
      return;
    }

    const submittingUserId = readyUserId;
    const input = formToInput(profileState.form);
    saveAbortControllerRef.current?.abort();
    const controller = new AbortController();
    saveAbortControllerRef.current = controller;
    setSaveState({ status: "saving" });

    try {
      const result = await saveUserProfile(input, controller.signal);
      if (
        saveAbortControllerRef.current !== controller ||
        activeUserIdRef.current !== submittingUserId
      ) {
        return;
      }

      if (result.ok) {
        saveAbortControllerRef.current = null;
        if (result.user.uid !== submittingUserId) {
          setSaveState({
            status: "error",
            kind: "error",
            message: "프로필 설정 응답의 사용자 정보가 현재 로그인 계정과 다릅니다.",
          });
          return;
        }
        setProfileState({
          status: "ready",
          form: profileToForm(result.profile),
        });
        setSaveState({ status: "success", message: result.message });
        return;
      }

      saveAbortControllerRef.current = null;
      setSaveState({
        status: "error",
        kind: result.kind,
        message: result.message,
        responseStatus: result.status,
      });
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      if (
        saveAbortControllerRef.current !== controller ||
        activeUserIdRef.current !== submittingUserId
      ) {
        return;
      }
      saveAbortControllerRef.current = null;
      setSaveState({
        status: "error",
        kind: "error",
        message: `프로필 설정 저장 중 오류가 발생했습니다. ${getErrorMessage(error)}`,
      });
    } finally {
      if (saveAbortControllerRef.current === controller) {
        saveAbortControllerRef.current = null;
      }
    }
  };

  const handleResendVerification = async () => {
    setVerificationNotice(null);
    setIsResendingVerification(true);
    try {
      const result = await resendEmailVerification();
      if (result.ok) {
        setVerificationNotice({
          tone: "success",
          message: "이메일 인증 메일을 다시 보냈습니다. 메일함을 확인해 주세요.",
        });
      } else {
        setVerificationNotice({ tone: "error", message: result.message });
      }
    } finally {
      setIsResendingVerification(false);
    }
  };

  const handleSignOut = async () => {
    setNotice(null);
    setIsSigningOut(true);

    try {
      const { auth } = getFirebaseClient();
      await signOut(auth);
      router.replace("/login");
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
                <span className="rounded-md bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700">
                  UID {formatUserId(account.uid)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="inline-flex h-10 w-fit items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-rose-300 hover:text-rose-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
            >
              {isSigningOut ? "로그아웃 중" : "로그아웃"}
            </button>
          </div>
        </div>

        {notice ? (
          <div
            className={`mt-5 rounded-md border px-4 py-3 text-sm font-semibold ${noticeStyles[notice.tone]}`}
            role={notice.tone === "error" ? "alert" : "status"}
          >
            {notice.message}
          </div>
        ) : null}

        {account.showVerificationBanner ? (
          <div
            className="mt-5 flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between"
            role="status"
          >
            <p className="font-semibold">
              이메일 인증이 완료되지 않았습니다. 메일함을 확인해 주세요.
            </p>
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={isResendingVerification}
              className="inline-flex h-9 w-fit shrink-0 items-center justify-center rounded-md border border-amber-400 bg-white px-3 text-xs font-semibold text-amber-900 transition hover:border-amber-500 hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-amber-200 disabled:text-amber-400"
            >
              {isResendingVerification ? "전송 중" : "인증 메일 다시 보내기"}
            </button>
          </div>
        ) : null}

        {verificationNotice ? (
          <div
            className={`mt-3 rounded-md border px-4 py-2 text-sm font-semibold ${noticeStyles[verificationNotice.tone]}`}
            role={verificationNotice.tone === "error" ? "alert" : "status"}
          >
            {verificationNotice.message}
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

      <ProfileSettingsSection
        profileState={profileState}
        saveState={saveState}
        onNicknameChange={handleNicknameChange}
        onPreferredRegionChange={handlePreferredRegionChange}
        onSportToggle={handleSportToggle}
        onNotificationsToggle={handleNotificationsToggle}
        onSubmit={handleProfileSubmit}
      />
    </section>
  );
}

function ProfileSettingsSection({
  profileState,
  saveState,
  onNicknameChange,
  onPreferredRegionChange,
  onSportToggle,
  onNotificationsToggle,
  onSubmit,
}: {
  profileState: ProfileState;
  saveState: SaveState;
  onNicknameChange: (value: string) => void;
  onPreferredRegionChange: (value: string) => void;
  onSportToggle: (sport: Sport, checked: boolean) => void;
  onNotificationsToggle: (checked: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-sky-700">프로필 설정</p>
        <h2 className="text-2xl font-bold text-slate-950">
          닉네임과 선호 정보
        </h2>
        <p className="text-sm leading-6 text-slate-600">
          입력한 정보는 예약 추천과 알림에 사용됩니다.
        </p>
      </div>

      {profileState.status === "loading" || profileState.status === "idle" ? (
        <div
          className="mt-5 rounded-md border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-600"
          aria-live="polite"
          aria-busy="true"
        >
          프로필 설정을 불러오고 있습니다.
        </div>
      ) : null}

      {profileState.status === "error" ? (
        <div
          className="mt-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-4 text-sm leading-6 text-rose-800"
          role="alert"
        >
          <p className="font-bold">프로필 설정을 불러오지 못했습니다</p>
          <p className="mt-1">
            {profileState.responseStatus === undefined
              ? profileState.message
              : `${profileState.message} status=${profileState.responseStatus}`}
          </p>
        </div>
      ) : null}

      {profileState.status === "ready" ? (
        <ProfileSettingsForm
          form={profileState.form}
          saveState={saveState}
          onNicknameChange={onNicknameChange}
          onPreferredRegionChange={onPreferredRegionChange}
          onSportToggle={onSportToggle}
          onNotificationsToggle={onNotificationsToggle}
          onSubmit={onSubmit}
        />
      ) : null}
    </section>
  );
}

function ProfileSettingsForm({
  form,
  saveState,
  onNicknameChange,
  onPreferredRegionChange,
  onSportToggle,
  onNotificationsToggle,
  onSubmit,
}: {
  form: ProfileFormState;
  saveState: SaveState;
  onNicknameChange: (value: string) => void;
  onPreferredRegionChange: (value: string) => void;
  onSportToggle: (sport: Sport, checked: boolean) => void;
  onNotificationsToggle: (checked: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isSaving = saveState.status === "saving";
  const [nicknameStatus, setNicknameStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "error"
  >("idle");

  // 닉네임 변경 시 400ms debounce 후 server check. 본인 닉네임은 server가 available로 처리.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const trimmed = form.nickname.trim();
    if (trimmed.length === 0) {
      setNicknameStatus("idle");
      return;
    }
    setNicknameStatus("checking");
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const result = await checkNicknameAvailability(trimmed, controller.signal);
        if (controller.signal.aborted) return;
        if (!result.ok) {
          setNicknameStatus("error");
          return;
        }
        if (result.available) setNicknameStatus("available");
        else setNicknameStatus(result.reason === "invalid" ? "error" : "taken");
      } catch {
        if (!controller.signal.aborted) setNicknameStatus("error");
      }
    }, 400);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [form.nickname]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const nicknameIsTaken = nicknameStatus === "taken";
  const isSaveDisabled =
    isSaving || nicknameStatus === "checking" || nicknameIsTaken;

  return (
    <form className="mt-5 flex flex-col gap-5" onSubmit={onSubmit} noValidate>
      <div className="flex flex-col gap-2">
        <label
          htmlFor="profile-nickname"
          className="text-sm font-bold text-slate-800"
        >
          닉네임
        </label>
        <input
          id="profile-nickname"
          type="text"
          value={form.nickname}
          onChange={(event) => onNicknameChange(event.target.value)}
          maxLength={30}
          placeholder="예: 낙성대 농구왕"
          disabled={isSaving}
          aria-invalid={nicknameIsTaken || undefined}
          className={`h-11 rounded-md border bg-white px-3 text-sm text-slate-950 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ${
            nicknameIsTaken
              ? "border-rose-400 focus-visible:ring-rose-200"
              : "border-slate-300 focus-visible:ring-sky-500"
          }`}
        />
        {nicknameIsTaken ? (
          <p className="text-xs font-semibold text-rose-700" role="alert">
            이미 사용 중인 닉네임입니다.
          </p>
        ) : nicknameStatus === "available" && form.nickname.trim().length > 0 ? (
          <p className="text-xs font-semibold text-emerald-700">
            사용 가능한 닉네임입니다.
          </p>
        ) : nicknameStatus === "checking" ? (
          <p className="text-xs text-slate-500">확인 중...</p>
        ) : (
          <p className="text-xs text-slate-500">최대 30자까지 입력할 수 있습니다.</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="profile-region"
          className="text-sm font-bold text-slate-800"
        >
          선호 지역
        </label>
        <input
          id="profile-region"
          type="text"
          value={form.preferredRegion}
          onChange={(event) => onPreferredRegionChange(event.target.value)}
          maxLength={100}
          placeholder="예: 서울 관악구"
          disabled={isSaving}
          className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
        />
        <p className="text-xs text-slate-500">자주 이용하는 지역을 입력하세요.</p>
      </div>

      <fieldset className="flex flex-col gap-2" disabled={isSaving}>
        <legend className="text-sm font-bold text-slate-800">선호 종목</legend>
        <p className="text-xs text-slate-500">
          관심 있는 종목을 모두 선택할 수 있습니다.
        </p>
        <div className="mt-1 flex flex-wrap gap-2">
          {SPORTS.map((sport) => {
            const checked = form.preferredSports.includes(sport);
            return (
              <label
                key={sport}
                className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-semibold transition focus-within:ring-2 focus-within:ring-sky-500 ${
                  checked
                    ? "border-sky-500 bg-sky-50 text-sky-800"
                    : "border-slate-300 bg-white text-slate-800 hover:border-sky-300"
                } ${isSaving ? "cursor-not-allowed opacity-60" : ""}`}
              >
                <input
                  type="checkbox"
                  className="size-4 accent-sky-600"
                  checked={checked}
                  onChange={(event) =>
                    onSportToggle(sport, event.target.checked)
                  }
                  disabled={isSaving}
                />
                {sport}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label className={`inline-flex cursor-pointer items-center gap-3 text-sm font-bold text-slate-800 ${isSaving ? "cursor-not-allowed opacity-60" : ""}`}>
          <input
            type="checkbox"
            className="size-4 accent-sky-600"
            checked={form.reservationNotificationsEnabled}
            onChange={(event) => onNotificationsToggle(event.target.checked)}
            disabled={isSaving}
          />
          예약 알림 받기
          <span className="text-xs font-normal text-slate-400">(준비 중)</span>
        </label>
        <p className="text-xs text-slate-500">
          예약 변경사항 알림 기능을 준비 중입니다. 설정을 저장해 두면 기능이 켜질 때 자동으로 적용됩니다.
        </p>
      </div>

      {saveState.status === "success" ? (
        <div
          className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"
          role="status"
        >
          {saveState.message}
        </div>
      ) : null}

      {saveState.status === "error" ? (
        <div
          className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-800"
          role="alert"
        >
          <p className="font-bold">프로필 설정을 저장하지 못했습니다</p>
          <p className="mt-1">
            {saveState.responseStatus === undefined
              ? saveState.message
              : `${saveState.message} status=${saveState.responseStatus}`}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isSaveDisabled}
          className="inline-flex h-11 items-center justify-center rounded-md bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
        >
          {isSaving ? "저장 중" : "저장"}
        </button>
        {isSaving ? (
          <span
            className="text-xs font-semibold text-slate-500"
            aria-live="polite"
          >
            서버에 저장하고 있습니다.
          </span>
        ) : null}
      </div>
    </form>
  );
}
