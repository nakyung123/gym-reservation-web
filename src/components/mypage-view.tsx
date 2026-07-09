"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { useTranslations } from "next-intl";
import {
  MypageBoard,
  type BoardColumn,
  type BoardRow,
} from "@/components/mypage-board";
import { BoardPagination } from "@/components/board-pagination";
import { ReservationQrModal } from "@/components/reservation-qr-modal";
import { AlertModal } from "@/components/alert-modal";
import { resendEmailVerification } from "@/lib/firebase-email-auth";
import {
  reauthenticateMyPassword,
  updateMyPasswordDirect,
} from "@/lib/firebase-password-update";
import { getFirebaseClient } from "@/lib/firebase-client";
import { useRequireAuth } from "@/lib/use-require-auth";
import { useFavorites } from "@/hooks/use-favorites";
import { parseReservationSnapshot } from "@/lib/reservation-repository";
import { reservationRepository } from "@/lib/reservation-repository-provider";
import {
  PASSWORD_POLICY_HINT,
  validatePasswordPolicy,
} from "@/lib/password-policy";
import { withdrawAccount } from "@/lib/withdrawal-client";
import { getGymSportPrice } from "@/lib/gym-utils";
import { fetchUserProfile, saveUserProfile } from "@/lib/user-profile-client";
import { fetchMyVocPosts } from "@/lib/voc-client";
import { MypageInquiriesTable } from "@/components/mypage-inquiries-table";
import { reservationDisplayNumber } from "@/components/reservation-ticket";
import type { UserProfile } from "@/lib/user-profile";
import type { Gym, Reservation, VocPost } from "@/types/domain";

type Tab = "reservations" | "favorites" | "inquiries" | "info";

function parseTab(value: string | null): Tab {
  if (value === "favorites" || value === "inquiries" || value === "info") {
    return value;
  }
  return "reservations";
}

// 예약 인원 역산: Reservation에는 인원 컬럼이 없고 price를 단가×인원 합산가로 저장하므로,
// price ÷ 종목 단가가 정수로 딱 떨어질 때만 인원으로 신뢰한다. 시설 미확인·단가 변경 등으로
// 나눠떨어지지 않으면 null을 반환해 QR 화면에서 "—"로 표기한다(잘못된 값 노출 방지).
function derivePeople(gym: Gym | undefined, reservation: Reservation): number | null {
  if (!gym) return null;
  const unit = getGymSportPrice(gym, reservation.sport);
  if (!Number.isFinite(unit) || unit <= 0) return null;
  const people = reservation.price / unit;
  return Number.isInteger(people) && people > 0 ? people : null;
}

const TABS: { key: Tab; href: string; labelKey: string }[] = [
  { key: "reservations", href: "/mypage", labelKey: "tabReservations" },
  { key: "favorites", href: "/mypage?tab=favorites", labelKey: "tabFavorites" },
  { key: "inquiries", href: "/mypage?tab=inquiries", labelKey: "tabInquiries" },
  { key: "info", href: "/mypage?tab=info", labelKey: "tabAccount" },
];

const PER_PAGE = 10;
// 탈퇴 모달은 사유 카테고리를 노출하지 않으므로(=KMI 모달) 기본값으로 저장한다.
const DEFAULT_WITHDRAW_CATEGORY = "기타" as const;

type AuthState =
  | { status: "loading" }
  | { status: "ready"; user: User }
  | { status: "signed-out" }
  | { status: "error"; message: string };

// 회원정보변경에서 자체 입력받는 회원 정보(휴대폰 본인인증 없이 직접 입력).
type ProfileFormState = {
  name: string;
  phone: string;
  birthDate: string;
  address: string;
  reservationNotificationsEnabled: boolean;
};

type ProfileState =
  | { status: "idle" }
  | { status: "loading" }
  // loginId: 가입 시 정한 로그인 아이디(불변, 표시 전용). 미설정 계정은 null.
  | { status: "ready"; form: ProfileFormState; loginId: string | null }
  | { status: "error"; message: string; responseStatus?: number };

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "success"; message: string }
  | { status: "error"; message: string; responseStatus?: number };

type NoticeState = { tone: "success" | "error"; message: string };

const emptyProfileForm: ProfileFormState = {
  name: "",
  phone: "",
  birthDate: "",
  address: "",
  reservationNotificationsEnabled: true,
};

function profileToForm(profile: UserProfile | null): ProfileFormState {
  if (!profile) return { ...emptyProfileForm };
  return {
    name: profile.name ?? "",
    phone: profile.phone ?? "",
    birthDate: profile.birthDate ?? "",
    address: profile.address ?? "",
    reservationNotificationsEnabled: profile.reservationNotificationsEnabled,
  };
}

function nullifyText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function formToInput(form: ProfileFormState) {
  return {
    name: nullifyText(form.name),
    phone: nullifyText(form.phone),
    birthDate: nullifyText(form.birthDate),
    address: nullifyText(form.address),
    reservationNotificationsEnabled: form.reservationNotificationsEnabled,
  };
}

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

// QR 코드는 이용 시작 30분 전부터 확인 가능. 그 전이면 true(아직 QR 미생성).
// 시각 비교(Date.now)는 렌더가 아닌 모듈 함수에서 수행한다.
const QR_LEAD_MS = 30 * 60 * 1000;
function isQrTooEarly(reservation: Reservation): boolean {
  const startMs = new Date(
    `${reservation.date}T${reservation.time}:00`,
  ).getTime();
  return !Number.isNaN(startMs) && Date.now() < startMs - QR_LEAD_MS;
}

function logErrorStatus(context: string, message: string, status?: number) {
  if (status !== undefined) {
    console.error(`[mypage:${context}] status=${status} ${message}`);
  }
}

function parsePage(value: string | null): number {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
}

function LoadingPanel() {
  const t = useTranslations("Mypage");
  return (
    <section
      className="mx-auto w-full max-w-4xl rounded-2xl border border-line bg-white p-8 text-center shadow-sm"
      aria-live="polite"
      aria-busy="true"
    >
      <p className="text-sm font-semibold text-accent-strong">{t("eyebrow")}</p>
      <h1 className="mt-2 break-keep text-2xl font-bold text-slate-950 sm:text-3xl">
        {t("loadingTitle")}
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">{t("loadingDesc")}</p>
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
      className="mx-auto w-full max-w-4xl rounded-2xl border border-error/30 bg-error/10 p-8 text-center text-error shadow-sm"
      role="alert"
    >
      <p className="text-sm font-semibold">{t("eyebrow")}</p>
      <h1 className="mt-2 break-keep text-2xl font-bold sm:text-3xl">{title}</h1>
      <p className="mt-3 text-sm leading-6">{message}</p>
    </section>
  );
}

function SignedOutPanel() {
  const t = useTranslations("Mypage");
  return (
    <section className="mx-auto w-full max-w-4xl rounded-2xl border border-line bg-white p-8 text-center shadow-sm">
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

// 회원정보변경 진입 게이트 (KMI: 본인 확인). 비밀번호 회원만 노출.
function AccountGate({ onUnlock }: { onUnlock: () => void }) {
  const t = useTranslations("Mypage");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "checking" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length === 0 || state.kind === "checking") return;
    setState({ kind: "checking" });
    const result = await reauthenticateMyPassword(password);
    if (result.ok) {
      onUnlock();
      return;
    }
    setState({ kind: "error", message: result.message });
  };

  return (
    <section className="mx-auto w-full max-w-xl rounded-2xl border border-line bg-surface-2/40 px-6 py-12 sm:px-12 sm:py-14">
      <h2 className="text-[20px] font-bold text-slate-950">{t("gateTitle")}</h2>
      <form className="mt-6 flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            if (state.kind === "error") setState({ kind: "idle" });
          }}
          placeholder={t("gatePlaceholder")}
          disabled={state.kind === "checking"}
          aria-invalid={state.kind === "error" || undefined}
          className={`h-12 w-full rounded-xl border bg-white px-4 text-[15px] text-slate-950 placeholder:text-subtle focus-visible:outline-none focus-visible:ring-2 disabled:bg-slate-100 ${
            state.kind === "error"
              ? "border-error focus-visible:ring-error/30"
              : "border-line-strong focus-visible:ring-accent"
          }`}
        />
        {state.kind === "error" ? (
          <p className="text-sm font-semibold text-error" role="alert">
            {state.message}
          </p>
        ) : null}
        <div className="mt-2 flex justify-center">
          <button
            type="submit"
            disabled={password.length === 0 || state.kind === "checking"}
            className="inline-flex h-12 min-w-40 items-center justify-center rounded-full bg-accent px-8 text-[16px] font-bold text-accent-ink transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            {state.kind === "checking" ? t("gateChecking") : t("gateConfirm")}
          </button>
        </div>
      </form>
    </section>
  );
}

export function MypageView({ gyms }: { gyms: Gym[] }) {
  const t = useTranslations("Mypage");
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  useRequireAuth({ from: "/mypage" });
  const activeUserIdRef = useRef<string | null>(null);
  const [authState, setAuthState] = useState<AuthState>({ status: "loading" });
  const [profileState, setProfileState] = useState<ProfileState>({
    status: "idle",
  });
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [verificationNotice, setVerificationNotice] =
    useState<NoticeState | null>(null);
  // 회원정보변경 게이트 통과 여부. 계정이 바뀌면 다시 잠근다.
  const [gateUnlocked, setGateUnlocked] = useState(false);
  const saveAbortControllerRef = useRef<AbortController | null>(null);
  const readyUserId = authState.status === "ready" ? authState.user.uid : null;

  const { favorites, loadError: favoritesLoadError } = useFavorites();

  useEffect(() => {
    try {
      const { auth } = getFirebaseClient();
      const unsubscribe = onAuthStateChanged(
        auth,
        (user) => {
          activeUserIdRef.current = user?.uid ?? null;
          saveAbortControllerRef.current?.abort();
          saveAbortControllerRef.current = null;
          setProfileState(user ? { status: "loading" } : { status: "idle" });
          setSaveState({ status: "idle" });
          setGateUnlocked(false);
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
      queueMicrotask(() => {
        setAuthState({
          status: "error",
          message: `로그인 상태를 확인하지 못했습니다. ${getErrorMessage(error)}`,
        });
      });
    }
  }, []);

  useEffect(() => {
    if (!readyUserId) return;
    const controller = new AbortController();
    fetchUserProfile(controller.signal)
      .then((result) => {
        if (result.ok) {
          if (result.user.uid !== readyUserId) {
            if (activeUserIdRef.current !== readyUserId) return;
            setProfileState({
              status: "error",
              message:
                "회원정보 응답의 사용자 정보가 현재 로그인 계정과 다릅니다.",
            });
            return;
          }
          setProfileState({
            status: "ready",
            form: profileToForm(result.profile),
            loginId: result.profile?.loginId ?? null,
          });
          return;
        }
        logErrorStatus("profile-fetch", result.message, result.status);
        setProfileState({
          status: "error",
          message: result.message,
          responseStatus: result.status,
        });
      })
      .catch((error) => {
        if (isAbortError(error)) return;
        setProfileState({
          status: "error",
          message: `회원정보를 불러오는 중 오류가 발생했습니다. ${getErrorMessage(error)}`,
        });
      });
    return () => controller.abort();
  }, [readyUserId]);

  const account = useMemo(() => {
    if (authState.status !== "ready") return null;
    const { user } = authState;
    const isPasswordProvider = user.providerData.some(
      (p) => p.providerId === "password",
    );
    return {
      email: user.email ?? t("noEmail"),
      isPasswordProvider,
      showVerificationBanner:
        Boolean(user.email) &&
        user.emailVerified === false &&
        isPasswordProvider,
    };
  }, [authState, t]);

  const updateProfileForm = (
    updater: (form: ProfileFormState) => ProfileFormState,
  ) => {
    setProfileState((prev) => {
      if (prev.status !== "ready") return prev;
      return { status: "ready", form: updater(prev.form), loginId: prev.loginId };
    });
    setSaveState((prev) => (prev.status === "idle" ? prev : { status: "idle" }));
  };

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (profileState.status !== "ready" || !readyUserId) return;
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
            message:
              "회원정보 응답의 사용자 정보가 현재 로그인 계정과 다릅니다.",
          });
          return;
        }
        setProfileState({
          status: "ready",
          form: profileToForm(result.profile),
          loginId: result.profile?.loginId ?? null,
        });
        setSaveState({ status: "success", message: result.message });
        return;
      }
      saveAbortControllerRef.current = null;
      logErrorStatus("profile-save", result.message, result.status);
      setSaveState({
        status: "error",
        message: result.message,
        responseStatus: result.status,
      });
    } catch (error) {
      if (isAbortError(error)) return;
      if (
        saveAbortControllerRef.current !== controller ||
        activeUserIdRef.current !== submittingUserId
      ) {
        return;
      }
      saveAbortControllerRef.current = null;
      setSaveState({
        status: "error",
        message: `회원정보 저장 중 오류가 발생했습니다. ${getErrorMessage(error)}`,
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
      setVerificationNotice(
        result.ok
          ? { tone: "success", message: t("resendSuccess") }
          : { tone: "error", message: result.message },
      );
    } finally {
      setIsResendingVerification(false);
    }
  };

  if (authState.status === "loading") {
    return (
      <Shell>
        <LoadingPanel />
      </Shell>
    );
  }
  if (authState.status === "error") {
    return (
      <Shell>
        <ErrorPanel title={t("authErrorTitle")} message={authState.message} />
      </Shell>
    );
  }
  if (authState.status === "signed-out" || !account) {
    return (
      <Shell>
        <SignedOutPanel />
      </Shell>
    );
  }

  return (
    <Shell>
      {account.showVerificationBanner ? (
        <div
          className="mb-5 flex flex-col gap-3 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning sm:flex-row sm:items-center sm:justify-between"
          role="status"
        >
          <p className="font-semibold">{t("verificationBanner")}</p>
          <button
            type="button"
            onClick={handleResendVerification}
            disabled={isResendingVerification}
            className="inline-flex h-9 w-fit shrink-0 items-center justify-center rounded-md border border-warning/50 bg-white px-3 text-xs font-semibold text-warning transition hover:border-warning hover:bg-warning/15 disabled:cursor-not-allowed disabled:border-warning/20 disabled:text-warning/50"
          >
            {isResendingVerification ? t("resending") : t("resendVerification")}
          </button>
        </div>
      ) : null}

      {verificationNotice ? (
        <div
          className={`mb-5 rounded-md border px-4 py-2 text-sm font-semibold ${noticeStyles[verificationNotice.tone]}`}
          role={verificationNotice.tone === "error" ? "alert" : "status"}
        >
          {verificationNotice.message}
        </div>
      ) : null}

      {/* 탭: 문의·FAQ 탭과 동일(grid 4등분, 비활성 muted, 활성 네이비 볼드+밑줄).
          하단 구분선은 양쪽 화면 끝까지(full-bleed) 깔고, 활성 탭 밑줄이 그 위에 얹힌다. */}
      <div className="relative isolate">
        <nav
          aria-label={t("tabsAria")}
          className="grid grid-cols-2 sm:grid-cols-4"
        >
          {TABS.map((tabItem) => {
            const active = tab === tabItem.key;
            return (
              <Link
                key={tabItem.key}
                href={tabItem.href}
                aria-current={active ? "page" : undefined}
                className={`-mb-px border-b-2 py-4 text-center text-[18px] transition sm:text-[22px] ${
                  active
                    ? "border-accent font-bold text-accent-strong"
                    : "border-transparent font-medium text-muted hover:text-foreground"
                }`}
              >
                {t(tabItem.labelKey)}
              </Link>
            );
          })}
        </nav>
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-[calc(50%_-_50vw)] -z-10 h-px w-screen bg-line"
        />
      </div>

      {/* 탭↔표 간격: 그림판 지시 #4(72px) */}
      <div className="mt-[72px]">
        {tab === "reservations" ? (
          <ReservationsBoardPanel
            gyms={gyms}
            page={parsePage(searchParams.get("resvPage"))}
          />
        ) : tab === "favorites" ? (
          <FavoritesPanel
            gyms={gyms}
            favorites={favorites}
            loadError={favoritesLoadError}
            page={parsePage(searchParams.get("favPage"))}
          />
        ) : tab === "inquiries" ? (
          <InquiriesPanel
            gyms={gyms}
            page={parsePage(searchParams.get("inqPage"))}
          />
        ) : account.isPasswordProvider && !gateUnlocked ? (
          <AccountGate onUnlock={() => setGateUnlocked(true)} />
        ) : (
          <AccountPanel
            email={account.email}
            isPasswordProvider={account.isPasswordProvider}
            profileState={profileState}
            saveState={saveState}
            onFieldChange={(field, value) =>
              updateProfileForm((form) => ({ ...form, [field]: value }))
            }
            onSubmit={handleProfileSubmit}
            onRelock={() => setGateUnlocked(false)}
          />
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Mypage");
  return (
    <div className="mx-auto w-full max-w-[1440px] px-5 py-9 sm:px-8 sm:py-10">
      <nav aria-label="breadcrumb" className="text-[13px] text-muted">
        <ol className="flex items-center gap-1.5">
          <li>
            <Link href="/" className="transition hover:text-accent-strong">
              {t("breadcrumbHome")}
            </Link>
          </li>
          <li aria-hidden="true" className="text-line-strong">
            /
          </li>
          <li className="font-semibold text-foreground">{t("title")}</li>
        </ol>
      </nav>
      <h1 className="mt-3 text-[28px] font-bold text-foreground sm:text-[32px]">
        {t("title")}
      </h1>
      <p className="mb-6 mt-2 text-[15px] leading-relaxed text-muted">
        {t("subtitle")}
      </p>
      {children}
    </div>
  );
}

// 예약내역 표의 타원 버튼(예약 상세·QR 보기 공용). 기본 흰 배경, hover 시 네이비 채움. 117.92×40.
const RSV_PILL_CLASS =
  "inline-flex h-[40px] w-[117.92px] max-w-full items-center justify-center rounded-full border border-line-strong text-[14px] font-semibold text-foreground transition hover:border-accent hover:bg-accent hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

// 예약내역: KMI 보드 표(예약번호/예약일/체육관/종목/상태/예약 상세/QR코드).
function ReservationsBoardPanel({
  gyms,
  page,
}: {
  gyms: Gym[];
  page: number;
}) {
  const t = useTranslations("Mypage");
  const tR = useTranslations("Reservation");
  const snapshot = useSyncExternalStore(
    reservationRepository.subscribe,
    reservationRepository.getSnapshot,
    reservationRepository.getServerSnapshot,
  );
  const readResult = useMemo(
    () => parseReservationSnapshot(snapshot),
    [snapshot],
  );
  const reservations = useMemo(
    () => (readResult.ok ? readResult.reservations : []),
    [readResult],
  );
  const gymsById = useMemo(() => new Map(gyms.map((g) => [g.id, g])), [gyms]);
  const sorted = useMemo(
    () =>
      [...reservations].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [reservations],
  );

  // QR 보기 클릭 시 페이지 이동 없이 띄울 QR 체크인 팝업의 대상 예약.
  const [qrReservation, setQrReservation] = useState<Reservation | null>(null);
  // 이용 30분 전 이전에 QR 보기를 누르면 팝업 대신 안내 알림창을 띄운다.
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  // 30분 전 이전이면 팝업 대신 안내 알림창을 띄운다(판정은 모듈 함수 isQrTooEarly).
  const handleQrClick = (reservation: Reservation) => {
    if (isQrTooEarly(reservation)) {
      setAlertMessage("예약 시간 30분 전부터 QR 코드를 확인할 수 있습니다.");
      return;
    }
    setQrReservation(reservation);
  };

  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = sorted.slice(
    (currentPage - 1) * PER_PAGE,
    currentPage * PER_PAGE,
  );

  // 폭은 그리드(컨테이너) 안에 정확히 들어오도록 비율(%)로 둔다. 7칸 균등(≈1/7).
  const columns: BoardColumn[] = [
    { label: t("rsvColNumber"), width: "w-[14.285%]" },
    { label: t("rsvColDate"), width: "w-[14.285%]", hideOnMobile: true },
    { label: t("rsvColGym"), width: "w-[14.285%]" },
    { label: t("rsvColSport"), width: "w-[14.285%]", hideOnMobile: true },
    { label: t("rsvColStatus"), width: "w-[14.285%]" },
    { label: t("rsvColDetail"), width: "w-[14.285%]" },
    // QR 체크인은 모바일에서 자주 쓰는 핵심 동작이라 모바일에서도 노출한다.
    { label: t("rsvColQr"), width: "w-[14.285%]" },
  ];

  const rows: BoardRow[] = pageItems.map((reservation: Reservation) => {
    const gym = gymsById.get(reservation.gymId);
    const gymName = gym?.name ?? t("rsvMissingGym");
    // 자세히 보기는 예약 상세 페이지로 같은 탭에서 이동한다(사이트 헤더/푸터 유지).
    const detailHref = `/reservations/${encodeURIComponent(reservation.id)}/detail`;
    return {
      key: reservation.id,
      cells: [
        <span key="no" className="tabular-nums text-foreground">
          {reservationDisplayNumber(reservation)}
        </span>,
        <span key="date" className="tabular-nums text-foreground">
          {reservation.date}
        </span>,
        <span key="gym" className="block truncate text-foreground">
          {gymName}
        </span>,
        <span key="sport" className="text-foreground">
          {reservation.sport}
        </span>,
        // 예약 취소는 예약 상세 페이지에서만 제공한다. 목록 상태 칸은 상태 텍스트만 표시.
        <span key="status" className="text-foreground">
          {tR(`status.${reservation.status}`)}
        </span>,
        <Link key="detail" href={detailHref} className={RSV_PILL_CLASS}>
          {t("rsvDetailLink")}
        </Link>,
        reservation.status === "reserved" ? (
          <button
            key="qr"
            type="button"
            onClick={() => handleQrClick(reservation)}
            aria-label={t("rsvQrAria")}
            className={RSV_PILL_CLASS}
          >
            {t("rsvQrLink")}
          </button>
        ) : (
          <span key="qr" className="text-subtle">
            -
          </span>
        ),
      ],
    };
  });

  const buildHref = (target: number) => {
    const params = new URLSearchParams();
    if (target > 1) params.set("resvPage", String(target));
    const query = params.toString();
    return query ? `/mypage?${query}` : "/mypage";
  };

  return (
    <section className="w-full">
      <MypageBoard
        columns={columns}
        rows={rows}
        emptyMessage={t("reservationsEmpty")}
        cellHeightClass="h-[81px]"
      />
      <BoardPagination
        page={currentPage}
        totalPages={totalPages}
        buildHref={buildHref}
        labels={{
          pagination: t("pagination"),
          firstPage: t("firstPage"),
          prevPage: t("prevPage"),
          nextPage: t("nextPage"),
          lastPage: t("lastPage"),
        }}
      />
      {qrReservation ? (
        <ReservationQrModal
          reservation={qrReservation}
          gymName={
            gymsById.get(qrReservation.gymId)?.name ?? t("rsvMissingGym")
          }
          people={derivePeople(gymsById.get(qrReservation.gymId), qrReservation)}
          onClose={() => setQrReservation(null)}
        />
      ) : null}
      {alertMessage ? (
        <AlertModal
          message={alertMessage}
          onClose={() => setAlertMessage(null)}
        />
      ) : null}
    </section>
  );
}

// 즐겨찾기 내역: 즐겨찾기한 시설을 KMI 보드 표로. 없으면 빈 표.
function FavoritesPanel({
  gyms,
  favorites,
  loadError,
  page,
}: {
  gyms: Gym[];
  favorites: ReadonlySet<string>;
  loadError: string | null;
  page: number;
}) {
  const t = useTranslations("Mypage");

  // 예약횟수 집계용 예약 스냅샷. 예약내역 표와 동일한 저장소를 구독한다.
  const snapshot = useSyncExternalStore(
    reservationRepository.subscribe,
    reservationRepository.getSnapshot,
    reservationRepository.getServerSnapshot,
  );
  // 예약횟수 = 그 시설에 낸 예약 건수(상태 무관, 취소 포함).
  const bookingCountByGym = useMemo(() => {
    const map = new Map<string, number>();
    const parsed = parseReservationSnapshot(snapshot);
    if (parsed.ok) {
      for (const reservation of parsed.reservations) {
        map.set(reservation.gymId, (map.get(reservation.gymId) ?? 0) + 1);
      }
    }
    return map;
  }, [snapshot]);

  const favoritedGyms = useMemo(
    () =>
      gyms
        .filter((gym) => favorites.has(gym.id))
        .sort((left, right) => left.name.localeCompare(right.name, "ko")),
    [gyms, favorites],
  );

  const totalPages = Math.max(1, Math.ceil(favoritedGyms.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = favoritedGyms.slice(
    (currentPage - 1) * PER_PAGE,
    currentPage * PER_PAGE,
  );

  // 종목이 여러 개면 줄바꿈으로 행 높이가 커지므로 시설명 폭을 줄이고 종목 폭을 넓혀 밸런스를 맞춘다.
  const columns: BoardColumn[] = [
    { label: t("favColNumber"), width: "w-[10%]" },
    { label: t("favColName"), width: "w-[40%]" },
    { label: t("favColRegion"), width: "w-[16%]", hideOnMobile: true },
    { label: t("favColSports"), width: "w-[22%]", hideOnMobile: true },
    { label: t("favColUsage"), width: "w-[12%]" },
  ];

  const rows: BoardRow[] = pageItems.map((gym, index) => ({
    key: gym.id,
    cells: [
      <span key="no" className="tabular-nums text-muted">
        {(currentPage - 1) * PER_PAGE + index + 1}
      </span>,
      <Link
        key="name"
        href={`/gyms/${gym.id}`}
        className="font-medium text-foreground transition hover:text-accent-strong"
      >
        {gym.name}
      </Link>,
      <span key="region" className="text-foreground">
        {gym.region}
      </span>,
      <span key="sports" className="text-foreground">
        {gym.sports.join(", ")}
      </span>,
      <span key="usage" className="tabular-nums text-foreground">
        {t("favUsageCount", { count: bookingCountByGym.get(gym.id) ?? 0 })}
      </span>,
    ],
  }));

  const buildHref = (target: number) => {
    const params = new URLSearchParams();
    params.set("tab", "favorites");
    if (target > 1) params.set("favPage", String(target));
    return `/mypage?${params.toString()}`;
  };

  return (
    <section className="w-full">
      {loadError ? (
        <div
          className="mb-4 rounded-md border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error"
          role="alert"
        >
          {t("favLoadError")}
        </div>
      ) : null}
      <MypageBoard
        columns={columns}
        rows={rows}
        emptyMessage={t("favoritesEmpty")}
        cellHeightClass="h-[81px]"
      />
      <BoardPagination
        page={currentPage}
        totalPages={totalPages}
        buildHref={buildHref}
        labels={{
          pagination: t("pagination"),
          firstPage: t("firstPage"),
          prevPage: t("prevPage"),
          nextPage: t("nextPage"),
          lastPage: t("lastPage"),
        }}
      />
    </section>
  );
}

type VocListState =
  | { status: "loading" }
  | { status: "ready"; posts: VocPost[]; total: number }
  | { status: "error"; message: string };

// 문의 내역: 로그인 사용자가 공개 문의 게시판(문의·FAQ)에 등록한 글을 예약/즐겨찾기 내역과 동일한
// 표로 보여준다. 작성은 공개 게시판에서 하므로 여기엔 '문의하기' 버튼이 없다.
// 행을 누르면 그 아래로 체육관/카테고리/답변이 펼쳐진다(표 구현은 MypageInquiriesTable).
function InquiriesPanel({ gyms, page }: { gyms: Gym[]; page: number }) {
  const t = useTranslations("Mypage");
  const [state, setState] = useState<VocListState>({ status: "loading" });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetchMyVocPosts(page, controller.signal)
      .then((result) => {
        if (result.ok) {
          setState({ status: "ready", posts: result.posts, total: result.total });
          return;
        }
        setState({ status: "error", message: result.message });
      })
      .catch((error) => {
        if (isAbortError(error)) return;
        setState({ status: "error", message: getErrorMessage(error) });
      });
    return () => controller.abort();
  }, [page]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const posts = state.status === "ready" ? state.posts : [];
  const total = state.status === "ready" ? state.total : 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const currentPage = Math.min(page, totalPages);

  const buildHref = (target: number) => {
    const params = new URLSearchParams();
    params.set("tab", "inquiries");
    if (target > 1) params.set("inqPage", String(target));
    return `/mypage?${params.toString()}`;
  };

  const emptyMessage =
    state.status === "loading"
      ? t("inqLoading")
      : state.status === "error"
        ? state.message
        : t("inquiriesEmpty");

  return (
    <section className="w-full">
      <MypageInquiriesTable
        posts={posts}
        gyms={gyms}
        total={total}
        page={currentPage}
        emptyMessage={emptyMessage}
      />
      <BoardPagination
        page={currentPage}
        totalPages={totalPages}
        buildHref={buildHref}
        labels={{
          pagination: t("pagination"),
          firstPage: t("firstPage"),
          prevPage: t("prevPage"),
          nextPage: t("nextPage"),
          lastPage: t("lastPage"),
        }}
      />
    </section>
  );
}

function FieldLabel({
  htmlFor,
  children,
  required,
}: {
  htmlFor: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-bold text-slate-800">
      {children}
      {required ? <span className="ml-0.5 text-error">*</span> : null}
    </label>
  );
}

const READONLY_INPUT_CLASS =
  "h-11 cursor-not-allowed rounded-md border border-line bg-slate-100 px-3 text-sm text-slate-500";
const INPUT_CLASS =
  "h-11 rounded-md border border-line-strong bg-white px-3 text-sm text-slate-950 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

// 회원정보변경: KMI 폼(성명/아이디/생년월일/비밀번호+확인+변경/연락처/주소 + 정보수정·회원탈퇴).
function AccountPanel({
  email,
  isPasswordProvider,
  profileState,
  saveState,
  onFieldChange,
  onSubmit,
  onRelock,
}: {
  email: string;
  isPasswordProvider: boolean;
  profileState: ProfileState;
  saveState: SaveState;
  onFieldChange: (
    field: "name" | "phone" | "birthDate" | "address",
    value: string,
  ) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRelock: () => void;
}) {
  const t = useTranslations("Mypage");
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  if (profileState.status === "loading" || profileState.status === "idle") {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <div
          className="rounded-md border border-line bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-600"
          aria-live="polite"
          aria-busy="true"
        >
          {t("profileLoading")}
        </div>
      </div>
    );
  }

  if (profileState.status === "error") {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <div
          className="rounded-md border border-error/30 bg-error/10 px-4 py-4 text-sm leading-6 text-error"
          role="alert"
        >
          <p className="font-bold">{t("profileErrorTitle")}</p>
          <p className="mt-1">{profileState.message}</p>
        </div>
      </div>
    );
  }

  const { form } = profileState;
  const isSaving = saveState.status === "saving";

  return (
    <div className="mx-auto w-full max-w-2xl">
      <p className="mb-3 text-right text-xs text-error">{t("accountRequired")}</p>
      <section className="rounded-2xl border border-line bg-surface-2/40 p-6 sm:p-8">
        <form className="flex flex-col gap-5" onSubmit={onSubmit} noValidate>
          {/* 성명 */}
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor="account-name">{t("accountNameLabel")}</FieldLabel>
            <input
              id="account-name"
              type="text"
              value={form.name}
              onChange={(e) => onFieldChange("name", e.target.value)}
              maxLength={30}
              placeholder={t("namePlaceholder")}
              disabled={isSaving}
              className={INPUT_CLASS}
            />
          </div>

          {/* 아이디(로그인 식별자) - 읽기 전용. 아이디 미설정 계정(레거시/미완성)은 행을 숨긴다. */}
          {profileState.loginId ? (
            <div className="flex flex-col gap-2">
              <FieldLabel htmlFor="account-id" required>
                {t("accountIdLabel")}
              </FieldLabel>
              <input
                id="account-id"
                type="text"
                value={profileState.loginId}
                readOnly
                disabled
                className={READONLY_INPUT_CLASS}
              />
              <p className="text-xs text-slate-500">{t("loginIdReadonlyHint")}</p>
            </div>
          ) : null}

          {/* 이메일 - 읽기 전용 */}
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor="account-email" required>
              {t("accountEmailLabel")}
            </FieldLabel>
            <input
              id="account-email"
              type="email"
              value={email}
              readOnly
              disabled
              className={READONLY_INPUT_CLASS}
            />
            <p className="text-xs text-slate-500">{t("emailReadonlyHint")}</p>
          </div>

          {/* 생년월일 */}
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor="account-birth">{t("birthDateLabel")}</FieldLabel>
            <input
              id="account-birth"
              type="date"
              value={form.birthDate}
              onChange={(e) => onFieldChange("birthDate", e.target.value)}
              disabled={isSaving}
              className={`${INPUT_CLASS} sm:w-[220px]`}
            />
          </div>

          {/* 비밀번호 변경 (비번 회원만, KMI: 현재 비번 없이 새 비번+확인) */}
          {isPasswordProvider ? (
            <PasswordChangeInline onRelock={onRelock} disabled={isSaving} />
          ) : null}

          {/* 연락처 */}
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor="account-phone">{t("phoneLabel")}</FieldLabel>
            <input
              id="account-phone"
              type="tel"
              inputMode="numeric"
              value={form.phone}
              onChange={(e) => onFieldChange("phone", e.target.value)}
              maxLength={20}
              placeholder={t("phonePlaceholder")}
              disabled={isSaving}
              className={INPUT_CLASS}
            />
          </div>

          {/* 주소 */}
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor="account-address">{t("addressLabel")}</FieldLabel>
            <input
              id="account-address"
              type="text"
              value={form.address}
              onChange={(e) => onFieldChange("address", e.target.value)}
              maxLength={200}
              placeholder={t("addressPlaceholder")}
              disabled={isSaving}
              className={INPUT_CLASS}
            />
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

          {/* 하단 버튼: 회원탈퇴 · 정보수정 */}
          <div className="mt-2 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => setWithdrawOpen(true)}
              className="inline-flex h-11 items-center justify-center rounded-md border border-line-strong bg-white px-6 text-sm font-semibold text-slate-700 transition hover:border-error/40 hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {t("withdrawButton")}
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-6 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              {isSaving ? t("saving") : t("saveProfile")}
            </button>
          </div>
        </form>
      </section>

      {withdrawOpen ? (
        <WithdrawModal
          isPasswordProvider={isPasswordProvider}
          onClose={() => setWithdrawOpen(false)}
        />
      ) : null}
    </div>
  );
}

// KMI 폼 안의 인라인 비밀번호 변경(새 비번 + 확인 + 변경 버튼).
// 게이트에서 이미 재인증을 마쳤으므로 현재 비번을 다시 받지 않는다. 재인증 시한이 지나
// requires-recent-login이면 게이트를 다시 잠가 본인 확인을 재요청한다.
function PasswordChangeInline({
  onRelock,
  disabled,
}: {
  onRelock: () => void;
  disabled: boolean;
}) {
  const t = useTranslations("Mypage");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "success" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const policyError = newPassword.length > 0 ? validatePasswordPolicy(newPassword) : null;
  const mismatch =
    confirm.length > 0 && confirm !== newPassword ? t("pwMismatch") : null;
  const canSubmit =
    newPassword.length > 0 &&
    confirm.length > 0 &&
    !policyError &&
    !mismatch &&
    state.kind !== "loading";

  const handleChange = async () => {
    if (!canSubmit) return;
    setState({ kind: "loading" });
    const result = await updateMyPasswordDirect(newPassword);
    if (result.ok) {
      setState({ kind: "success" });
      setNewPassword("");
      setConfirm("");
      return;
    }
    if (result.reason === "requires-recent-login") {
      // 재인증 시한 만료: 게이트를 다시 잠가 본인 확인을 재요청한다.
      onRelock();
      return;
    }
    setState({ kind: "error", message: result.message });
  };

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-5">
      <div className="flex flex-col gap-2">
        <FieldLabel htmlFor="account-new-password" required>
          {t("pwNewLabel")}
        </FieldLabel>
        <input
          id="account-new-password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => {
            setNewPassword(e.target.value);
            if (state.kind !== "idle") setState({ kind: "idle" });
          }}
          placeholder={t("pwNewLabel")}
          disabled={disabled}
          aria-invalid={Boolean(policyError) || undefined}
          className={`${INPUT_CLASS} ${policyError ? "border-error focus-visible:ring-error/30" : ""}`}
        />
        <p className={`text-xs ${policyError ? "font-semibold text-error" : "text-slate-500"}`}>
          {policyError ?? PASSWORD_POLICY_HINT}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <FieldLabel htmlFor="account-confirm-password" required>
          {t("pwConfirmLabel")}
        </FieldLabel>
        <input
          id="account-confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            if (state.kind !== "idle") setState({ kind: "idle" });
          }}
          placeholder={t("pwConfirmLabel")}
          disabled={disabled}
          aria-invalid={Boolean(mismatch) || undefined}
          className={`${INPUT_CLASS} ${mismatch ? "border-error focus-visible:ring-error/30" : ""}`}
        />
        {mismatch ? (
          <p className="text-xs font-semibold text-error" role="alert">
            {mismatch}
          </p>
        ) : null}
      </div>

      {state.kind === "success" ? (
        <p
          className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm font-semibold text-success"
          role="status"
        >
          {t("pwSuccess")}
        </p>
      ) : null}
      {state.kind === "error" ? (
        <p
          className="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-sm text-error"
          role="alert"
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleChange}
          disabled={!canSubmit || disabled}
          className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          {state.kind === "loading" ? t("saving") : t("pwChangeButton")}
        </button>
      </div>
    </div>
  );
}

// 회원탈퇴 모달(KMI: [필수] 동의 체크 + 비밀번호 → 회원탈퇴). 사유 카테고리는 노출하지
// 않고 기본값으로 저장한다. 비번 회원은 비밀번호 재인증, 소셜은 동의만으로 진행한다.
// 백엔드의 부분 실패(진행 중 예약 / Auth 삭제 실패)는 그대로 보존해 안내·재시도한다.
function WithdrawModal({
  isPasswordProvider,
  onClose,
}: {
  isPasswordProvider: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("Mypage");
  const tW = useTranslations("Withdraw");
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [password, setPassword] = useState("");
  const [state, setState] = useState<
    | { kind: "form" }
    | { kind: "submitting" }
    | { kind: "success" }
    | { kind: "active-reservation"; message: string }
    | { kind: "auth-delete-failed"; message: string }
    | { kind: "error"; message: string }
  >({ kind: "form" });

  const canSubmit =
    agreed &&
    (!isPasswordProvider || password.length > 0) &&
    state.kind === "form";

  const runWithdraw = async () => {
    setState({ kind: "submitting" });
    const result = await withdrawAccount({
      category: DEFAULT_WITHDRAW_CATEGORY,
      detail: null,
    });
    if (result.ok) {
      setState({ kind: "success" });
      return;
    }
    if (result.reason === "active-reservation") {
      setState({ kind: "active-reservation", message: result.message });
      return;
    }
    if (result.reason === "auth-delete-failed") {
      setState({ kind: "auth-delete-failed", message: result.message });
      return;
    }
    setState({ kind: "error", message: result.message });
  };

  const handleSubmit = async () => {
    if (!agreed) return;
    if (isPasswordProvider) {
      if (password.length === 0) return;
      setState({ kind: "submitting" });
      // 본인 확인: 비밀번호 재인증 후 탈퇴. 비번이 틀리면 폼으로 되돌려 안내.
      const reauth = await reauthenticateMyPassword(password);
      if (!reauth.ok) {
        setState({ kind: "error", message: reauth.message });
        return;
      }
    }
    await runWithdraw();
  };

  const handleSuccess = async () => {
    try {
      const { auth } = getFirebaseClient();
      await signOut(auth);
    } catch (error) {
      console.warn("[withdraw] signOut failed:", error);
    }
    router.replace("/");
  };

  const overlayClass =
    "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4";
  const cardClass =
    "w-full max-w-md rounded-lg border border-line bg-white p-6 shadow-xl";

  if (state.kind === "success") {
    return (
      <div className={overlayClass} role="dialog" aria-modal="true">
        <div className={cardClass}>
          <h2 className="text-lg font-bold text-slate-950">
            {tW("successTitle")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {tW("successDesc")}
          </p>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={handleSuccess}
              className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent-hover"
            >
              {tW("confirm")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (state.kind === "active-reservation") {
    return (
      <div className={overlayClass} role="dialog" aria-modal="true">
        <div className={cardClass}>
          <h2 className="text-lg font-bold text-slate-950">
            {tW("activeReservationTitle")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {state.message}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center justify-center rounded-md border border-line-strong bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
            >
              {tW("close")}
            </button>
            <Link
              href="/mypage"
              className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover"
            >
              {t("tabReservations")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (state.kind === "auth-delete-failed") {
    return (
      <div className={overlayClass} role="dialog" aria-modal="true">
        <div className={cardClass}>
          <h2 className="text-lg font-bold text-slate-950">
            {tW("authFailTitle")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {state.message}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center justify-center rounded-md border border-line-strong bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
            >
              {tW("close")}
            </button>
            <button
              type="button"
              onClick={runWithdraw}
              className="inline-flex h-10 items-center justify-center rounded-md bg-error px-4 text-sm font-semibold text-white transition hover:bg-error/90"
            >
              {tW("retry")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={overlayClass} role="dialog" aria-modal="true" aria-labelledby="withdraw-modal-title">
      <div className={cardClass}>
        <h2 id="withdraw-modal-title" className="text-lg font-bold text-slate-950">
          {t("withdrawButton")}
        </h2>

        <div className="mt-4 rounded-md bg-surface-2/60 px-4 py-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              disabled={state.kind === "submitting"}
              className="size-4 accent-accent"
            />
            <span>
              <span className="text-accent-strong">{t("wdRequired")}</span>{" "}
              {t("wdAgree")}
            </span>
          </label>

          {isPasswordProvider ? (
            <div className="mt-4 border-t border-line pt-4">
              <p className="text-sm font-bold text-slate-800">{t("wdPwLabel")}</p>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (state.kind === "error") setState({ kind: "form" });
                }}
                placeholder={t("gatePlaceholder")}
                disabled={state.kind === "submitting"}
                className={`mt-2 w-full ${INPUT_CLASS}`}
              />
            </div>
          ) : null}
        </div>

        {state.kind === "error" ? (
          <p
            className="mt-3 rounded-md border border-error/30 bg-error/10 px-3 py-2 text-sm text-error"
            role="alert"
          >
            {state.message}
          </p>
        ) : null}

        <div className="mt-5 flex justify-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={state.kind === "submitting"}
            className="inline-flex h-11 min-w-[110px] items-center justify-center rounded-md border border-line-strong bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed"
          >
            {tW("confirmCancel")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="inline-flex h-11 min-w-[110px] items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {state.kind === "submitting" ? tW("submitting") : t("withdrawButton")}
          </button>
        </div>
      </div>
    </div>
  );
}
