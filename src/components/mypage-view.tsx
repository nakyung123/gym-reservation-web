"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useTranslations } from "next-intl";
import { reservationStatusBadgeStyles } from "@/components/reservation-ticket";
import { SPORTS } from "@/lib/domain-constants";
import { resendEmailVerification } from "@/lib/firebase-email-auth";
import { getFirebaseClient } from "@/lib/firebase-client";
import { useRequireAuth } from "@/lib/use-require-auth";
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
  | {
      status: "ready";
      form: ProfileFormState;
      // 마지막으로 서버에 저장된 닉네임. 헤더/요약 영역 표시는 이 값을 기준으로 하고,
      // 입력 중인 form.nickname은 저장 전까지 헤더에 반영되지 않는다.
      persistedNickname: string | null;
    }
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

// 예약 상태 지표 카드 색상은 예약 배지 SSOT(reservation-ticket.tsx)와 정렬한다.
// 예약중=accent 틴트, 취소=error, 사용완료=중립 회색, 그 외(전체/즐겨찾기)=중립.
const metricToneStyles = {
  neutral: "border-line bg-white text-slate-950",
  reserved: "border-accent/20 bg-accent-tint text-accent-strong",
  cancelled: "border-error/30 bg-error/10 text-error",
  used: "border-line bg-surface-2 text-muted",
};

const noticeStyles: Record<NoticeState["tone"], string> = {
  success: "border-success/30 bg-success/10 text-success",
  error: "border-error/30 bg-error/10 text-error",
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

function logErrorStatus(
  context: string,
  message: string,
  responseStatus?: number,
) {
  if (responseStatus !== undefined) {
    console.error(`[mypage:${context}] status=${responseStatus} ${message}`);
  }
}

function getAccountName(user: User, fallbackName: string): string {
  const displayName = user.displayName?.trim();
  if (displayName) {
    return displayName;
  }

  if (user.email) {
    return user.email.split("@")[0] || user.email;
  }

  // 익명 로그인 흐름은 폐기됐다(e7c9454). 도달 시 일반 fallback만 노출.
  return fallbackName;
}

function UserSilhouetteIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="size-10 text-slate-400"
    >
      <path
        fillRule="evenodd"
        d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function formatUserId(uid: string): string {
  if (uid.length <= 16) {
    return uid;
  }

  return `${uid.slice(0, 8)}...${uid.slice(-4)}`;
}

function LoadingPanel() {
  const t = useTranslations("Mypage");
  return (
    <section
      className="mx-auto w-full max-w-4xl rounded-lg border border-line bg-white p-8 text-center shadow-sm"
      aria-live="polite"
      aria-busy="true"
    >
      <p className="text-sm font-semibold text-accent-strong">{t("eyebrow")}</p>
      <h1 className="mt-2 break-keep text-2xl font-bold text-slate-950 sm:text-3xl">
        {t("loadingTitle")}
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        {t("loadingDesc")}
      </p>
      <div className="mt-6 flex justify-center" aria-hidden="true">
        <span className="size-8 animate-spin rounded-full border-2 border-line border-t-accent" />
      </div>
    </section>
  );
}

function ErrorPanel({ title, message }: { title: string; message: string }) {
  const t = useTranslations("Mypage");
  return (
    <section
      className="mx-auto w-full max-w-4xl rounded-lg border border-error/30 bg-error/10 p-8 text-center text-error shadow-sm"
      role="alert"
    >
      <p className="text-sm font-semibold">{t("eyebrow")}</p>
      <h1 className="mt-2 break-keep text-2xl font-bold sm:text-3xl">
        {title}
      </h1>
      <p className="mt-3 text-sm leading-6">{message}</p>
    </section>
  );
}

function SignedOutPanel() {
  const t = useTranslations("Mypage");
  return (
    <section className="mx-auto w-full max-w-4xl rounded-lg border border-line bg-white p-8 text-center shadow-sm">
      <p className="text-sm font-semibold text-accent-strong">{t("eyebrow")}</p>
      <h1 className="mt-2 break-keep text-2xl font-bold text-slate-950 sm:text-3xl">
        {t("signedOutTitle")}
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        {t("signedOutDesc")}
      </p>
    </section>
  );
}

function MetricCard({
  label,
  value,
  caption,
  tone = "neutral",
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
  const t = useTranslations("Mypage");
  return (
    <div
      className="rounded-lg border border-line bg-white p-4 shadow-sm"
      aria-busy="true"
    >
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <div className="mt-3 h-8 w-16 rounded bg-slate-100" aria-hidden="true" />
      <p className="mt-3 text-xs font-semibold text-slate-400">
        {t("loadingMetricCaption")}
      </p>
    </div>
  );
}

function SummaryPanel({ summaryState }: { summaryState: SummaryState }) {
  const t = useTranslations("Mypage");
  const tReservation = useTranslations("Reservation");
  if (summaryState.status === "loading" || summaryState.status === "idle") {
    return (
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <LoadingMetricCard label={t("metricTotal")} />
        {summaryStatusOrder.map((status) => (
          <LoadingMetricCard
            key={status}
            label={tReservation(`status.${status}`)}
          />
        ))}
        <LoadingMetricCard label={t("metricFavorites")} />
      </section>
    );
  }

  if (summaryState.status === "error") {
    return (
      <section
        className="rounded-lg border border-error/30 bg-error/10 p-5 text-error shadow-sm"
        role="alert"
      >
        <p className="text-sm font-bold">{t("summaryErrorTitle")}</p>
        <p className="mt-2 text-sm leading-6">{summaryState.message}</p>
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
          label={t("metricTotal")}
          value={summary.reservations.total}
          caption={t("metricTotalCaption")}
        />
        <MetricCard
          label={tReservation("status.reserved")}
          value={summary.reservations.reserved}
          tone="reserved"
        />
        <MetricCard
          label={tReservation("status.cancelled")}
          value={summary.reservations.cancelled}
          tone="cancelled"
        />
        <MetricCard
          label={tReservation("status.used")}
          value={summary.reservations.used}
          tone="used"
        />
        <MetricCard
          label={t("metricFavorites")}
          value={summary.favorites.activeGymCount}
          caption={t("metricFavoritesCaption")}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/reservations"
          aria-label={t("viewMyReservationsAria")}
          className="inline-flex h-10 items-center justify-center rounded-md border border-line-strong bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          {t("viewMyReservations")}
        </Link>
        <Link
          href="/gyms"
          aria-label={t("findGymAria")}
          className="inline-flex h-10 items-center justify-center rounded-md border border-line-strong bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          {t("findGym")}
        </Link>
      </div>

      {hasNoData ? (
        <div className="rounded-lg border border-dashed border-line-strong bg-white p-6 text-center shadow-sm">
          <p className="text-base font-bold text-slate-950">
            {t("noDataTitle")}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t("noDataDesc")}
          </p>
          <Link
            href="/gyms"
            className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            {t("findGym")}
          </Link>
        </div>
      ) : null}
    </section>
  );
}

function StatusBreakdown({ summaryState }: { summaryState: SummaryState }) {
  const t = useTranslations("Mypage");
  const tReservation = useTranslations("Reservation");
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
          {t("statusCount", {
            label: tReservation(`status.${status}`),
            count: reservations[status],
          })}
        </span>
      ))}
    </div>
  );
}

export function MypageView() {
  const t = useTranslations("Mypage");
  const router = useRouter();
  // signed-out 감지 + /login?from=/mypage redirect는 useRequireAuth가 처리.
  // 본 컴포넌트는 user 객체 자체가 필요해서 onAuthStateChanged로 직접 구독한다
  // (providerData / displayName / emailVerified 표시용).
  useRequireAuth({ from: "/mypage" });
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

        logErrorStatus("summary", result.message, result.status);
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
            persistedNickname: result.profile?.nickname ?? null,
          });
          return;
        }

        logErrorStatus("profile-fetch", result.message, result.status);
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
    // 헤더/요약은 마지막으로 저장된 닉네임(persistedNickname)만 본다. 입력 중인 form.nickname은
    // 사용자가 저장을 누르기 전에는 반영되지 않는다. 저장이 끝나 persistedNickname이 갱신되면
    // 그때 화면에 반영된다. 없으면 Firebase displayName으로 폴백.
    const profileNickname =
      profileState.status === "ready"
        ? (profileState.persistedNickname?.trim() || null)
        : null;
    const displayName = profileNickname ?? getAccountName(user, t("noName"));
    const isPasswordProvider = user.providerData.some(
      (p) => p.providerId === "password",
    );
    return {
      displayName,
      email: user.email ?? t("noEmail"),
      // password 가입자만 emailVerified를 의미있게 가진다. 소셜 가입자는 provider 측에서
      // 이미 검증되었다고 가정해 배너를 보이지 않는다.
      showVerificationBanner:
        Boolean(user.email) &&
        user.emailVerified === false &&
        isPasswordProvider,
      uid: user.uid,
      isPasswordProvider,
    };
  }, [authState, profileState, t]);

  const updateProfileForm = (updater: (form: ProfileFormState) => ProfileFormState) => {
    setProfileState((prev) => {
      if (prev.status !== "ready") {
        return prev;
      }
      return {
        status: "ready",
        form: updater(prev.form),
        persistedNickname: prev.persistedNickname,
      };
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
          persistedNickname: result.profile?.nickname ?? null,
        });
        setSaveState({ status: "success", message: result.message });
        return;
      }

      saveAbortControllerRef.current = null;
      logErrorStatus("profile-save", result.message, result.status);
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
          message: t("resendSuccess"),
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
        title={t("authErrorTitle")}
        message={authState.message}
      />
    );
  }

  if (authState.status === "signed-out" || !account) {
    return <SignedOutPanel />;
  }

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <section className="rounded-lg border border-line bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-accent-strong">{t("eyebrow")}</p>
        <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <span
              className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-slate-100"
              role="img"
              aria-label={t("profileImageAria", { name: account.displayName })}
            >
              <UserSilhouetteIcon />
            </span>
            <div className="min-w-0">
              <h1 className="break-words text-3xl font-bold text-slate-950">
                {account.displayName}
              </h1>
              <p className="mt-1 break-all text-sm text-slate-600">
                {account.email}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-accent-tint px-2.5 py-1 text-xs font-bold text-accent-strong">
                  UID {formatUserId(account.uid)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            {account.isPasswordProvider ? (
              <Link
                href="/mypage/password"
                className="inline-flex h-10 w-fit items-center justify-center rounded-md border border-line-strong bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                {t("changePassword")}
              </Link>
            ) : null}
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="inline-flex h-10 w-fit items-center justify-center rounded-md border border-line-strong bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-error/40 hover:text-error disabled:cursor-not-allowed disabled:border-line disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              {isSigningOut ? t("signingOut") : t("signOut")}
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
            className="mt-5 flex flex-col gap-3 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning sm:flex-row sm:items-center sm:justify-between"
            role="status"
          >
            <p className="font-semibold">
              {t("verificationBanner")}
            </p>
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={isResendingVerification}
              className="inline-flex h-9 w-fit shrink-0 items-center justify-center rounded-md border border-warning/50 bg-white px-3 text-xs font-semibold text-warning transition hover:border-warning hover:bg-warning/15 disabled:cursor-not-allowed disabled:border-warning/20 disabled:text-warning/50"
            >
              {isResendingVerification
                ? t("resending")
                : t("resendVerification")}
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
            <p className="text-sm font-semibold text-accent-strong">
              {t("activitySummary")}
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">
              {t("activityTitle")}
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
  const t = useTranslations("Mypage");
  return (
    <section className="rounded-lg border border-line bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-accent-strong">
          {t("profileEyebrow")}
        </p>
        <h2 className="text-2xl font-bold text-slate-950">
          {t("profileTitle")}
        </h2>
        <p className="text-sm leading-6 text-slate-600">
          {t("profileDesc")}
        </p>
      </div>

      {profileState.status === "loading" || profileState.status === "idle" ? (
        <div
          className="mt-5 rounded-md border border-line bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-600"
          aria-live="polite"
          aria-busy="true"
        >
          {t("profileLoading")}
        </div>
      ) : null}

      {profileState.status === "error" ? (
        <div
          className="mt-5 rounded-md border border-error/30 bg-error/10 px-4 py-4 text-sm leading-6 text-error"
          role="alert"
        >
          <p className="font-bold">{t("profileErrorTitle")}</p>
          <p className="mt-1">{profileState.message}</p>
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

      <div className="flex justify-end pt-2">
        <Link
          href="/mypage/withdraw"
          className="text-xs text-slate-400 underline-offset-2 hover:text-error hover:underline"
        >
          {t("withdrawLink")}
        </Link>
      </div>
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
  const t = useTranslations("Mypage");
  const isSaving = saveState.status === "saving";
  const [nicknameStatus, setNicknameStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid" | "error"
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
        else setNicknameStatus(result.reason === "invalid" ? "invalid" : "taken");
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
  const nicknameIsInvalid = nicknameStatus === "invalid";
  const nicknameCheckFailed = nicknameStatus === "error";
  // 중복/형식 오류 닉네임은 저장 자체를 막는다. 조회 실패(error)는 일시적일 수 있어
  // 저장을 막지 않고 서버 검증에 맡기되, 안내 문구로 실패를 명시한다(No Silent Fallback).
  const nicknameHasError = nicknameIsTaken || nicknameIsInvalid;
  const isSaveDisabled =
    isSaving ||
    nicknameStatus === "checking" ||
    nicknameIsTaken ||
    nicknameIsInvalid;

  return (
    <form className="mt-5 flex flex-col gap-5" onSubmit={onSubmit} noValidate>
      <div className="flex flex-col gap-2">
        <label
          htmlFor="profile-nickname"
          className="text-sm font-bold text-slate-800"
        >
          {t("nicknameLabel")}
        </label>
        <input
          id="profile-nickname"
          type="text"
          value={form.nickname}
          onChange={(event) => onNicknameChange(event.target.value)}
          maxLength={8}
          placeholder={t("nicknamePlaceholder")}
          disabled={isSaving}
          aria-invalid={nicknameHasError || undefined}
          className={`h-11 rounded-md border bg-white px-3 text-sm text-slate-950 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ${
            nicknameHasError
              ? "border-error focus-visible:ring-error/30"
              : "border-line-strong focus-visible:ring-accent"
          }`}
        />
        {nicknameIsTaken ? (
          <p className="text-xs font-semibold text-error" role="alert">
            {t("nicknameTaken")}
          </p>
        ) : nicknameIsInvalid ? (
          <p className="text-xs font-semibold text-error" role="alert">
            {t("nicknameInvalid")}
          </p>
        ) : nicknameCheckFailed ? (
          <p className="text-xs font-semibold text-warning" role="alert">
            {t("nicknameCheckFailed")}
          </p>
        ) : nicknameStatus === "available" && form.nickname.trim().length > 0 ? (
          <p className="text-xs font-semibold text-success">
            {t("nicknameAvailable")}
          </p>
        ) : nicknameStatus === "checking" ? (
          <p className="text-xs text-slate-500">{t("nicknameChecking")}</p>
        ) : (
          <p className="text-xs text-slate-500">{t("nicknameHint")}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="profile-region"
          className="text-sm font-bold text-slate-800"
        >
          {t("regionLabel")}
        </label>
        <input
          id="profile-region"
          type="text"
          value={form.preferredRegion}
          onChange={(event) => onPreferredRegionChange(event.target.value)}
          maxLength={100}
          placeholder={t("regionPlaceholder")}
          disabled={isSaving}
          className="h-11 rounded-md border border-line-strong bg-white px-3 text-sm text-slate-950 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
        />
        <p className="text-xs text-slate-500">{t("regionHint")}</p>
      </div>

      <fieldset className="flex flex-col gap-2" disabled={isSaving}>
        <legend className="text-sm font-bold text-slate-800">
          {t("sportsLegend")}
        </legend>
        <p className="text-xs text-slate-500">{t("sportsHint")}</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {SPORTS.map((sport) => {
            const checked = form.preferredSports.includes(sport);
            return (
              <label
                key={sport}
                className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-semibold transition focus-within:ring-2 focus-within:ring-accent ${
                  checked
                    ? "border-accent bg-accent-tint text-accent-strong"
                    : "border-line-strong bg-white text-slate-800 hover:border-accent"
                } ${isSaving ? "cursor-not-allowed opacity-60" : ""}`}
              >
                <input
                  type="checkbox"
                  className="size-4 accent-accent"
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
            className="size-4 accent-accent"
            checked={form.reservationNotificationsEnabled}
            onChange={(event) => onNotificationsToggle(event.target.checked)}
            disabled={isSaving}
          />
          {t("notificationsLabel")}
          <span className="text-xs font-normal text-slate-400">
            {t("notificationsBadge")}
          </span>
        </label>
        <p className="text-xs text-slate-500">{t("notificationsHint")}</p>
      </div>

      {saveState.status === "success" ? (
        <div
          className="rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm font-semibold text-success"
          role="status"
        >
          {saveState.message}
        </div>
      ) : null}

      {saveState.status === "error" ? (
        <div
          className="rounded-md border border-error/30 bg-error/10 px-4 py-3 text-sm leading-6 text-error"
          role="alert"
        >
          <p className="font-bold">{t("profileSaveErrorTitle")}</p>
          <p className="mt-1">{saveState.message}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isSaveDisabled}
          className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          {isSaving ? t("saving") : t("save")}
        </button>
        {isSaving ? (
          <span
            className="text-xs font-semibold text-slate-500"
            aria-live="polite"
          >
            {t("savingHint")}
          </span>
        ) : null}
      </div>
    </form>
  );
}
