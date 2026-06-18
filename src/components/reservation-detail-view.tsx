"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslations } from "next-intl";
import { useCurrentMinuteValue } from "@/hooks/use-current-minute";
import {
  getFirebaseAuthSessionServerSnapshot,
  getFirebaseAuthSessionSnapshot,
  parseFirebaseAuthSessionSnapshot,
  subscribeFirebaseAuthSession,
} from "@/lib/firebase-auth-session";
import { formatGymPrice } from "@/lib/gym-utils";
import {
  createUserReservationDetail,
  type UserReservationDetail,
} from "@/lib/reservation-detail";
import { parseReservationSnapshot } from "@/lib/reservation-repository";
import { reservationRepository } from "@/lib/reservation-repository-provider";
import {
  fetchUserReservation,
  type FetchUserReservationFailureKind,
} from "@/lib/reservation-detail-client";
import {
  formatCancellationDeadline,
  formatReservationCreatedAt,
  getReservationGymSummary,
  ReservationAdmissionTicket,
  ReservationInactiveTicket,
  reservationStatusBadgeStyles,
  ReservationUnavailableTicket,
} from "@/components/reservation-ticket";
import type { Gym, Reservation } from "@/types/domain";

// 서버 detail.cancellation.deadline은 ISO 문자열이므로 Date로 환산.
function parseCancellationDeadline(value: string | null): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const noticeStyles = {
  success: "border-success/30 bg-success/10 text-success",
  error: "border-error/30 bg-error/10 text-error",
};

type ReservationDetailViewProps = {
  gyms: Gym[];
  reservationId: string;
};

// reservationId가 바뀐 직후 이전 결과가 새 id에 잘못 매칭되지 않도록
// fetched/failed에 요청 시점의 reservationId를 함께 저장한다.
// loading은 별도 상태로 두지 않고, "idle 또는 다른 id의 결과만 있음"을 loading처럼 분기한다.
// (React 19의 react-hooks/set-state-in-effect 규칙을 피하기 위함)
type DetailFetchState =
  | { status: "idle" }
  | {
      status: "fetched";
      reservationId: string;
      reservation: Reservation;
      detail: UserReservationDetail;
      gym: Gym | null;
    }
  | {
      status: "failed";
      reservationId: string;
      kind: FetchUserReservationFailureKind;
      message: string;
    };

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function DetailState({
  eyebrow,
  title,
  message,
  tone = "default",
  busy = false,
}: {
  eyebrow?: string;
  title: string;
  message: string;
  tone?: "default" | "error";
  busy?: boolean;
}) {
  const t = useTranslations("ReservationDetail");
  const isError = tone === "error";
  const eyebrowText = eyebrow ?? t("stateEyebrow");

  return (
    <section
      className={`mx-auto w-full max-w-4xl rounded-lg border p-8 text-center shadow-sm ${
        isError
          ? "border-error/30 bg-error/10 text-error"
          : "border-line bg-white text-slate-950"
      }`}
      aria-live={busy ? "polite" : undefined}
      aria-busy={busy || undefined}
      role={isError ? "alert" : undefined}
    >
      <p
        className={`text-sm font-semibold ${isError ? "" : "text-accent-strong"}`}
      >
        {eyebrowText}
      </p>
      <h1 className="mt-2 break-keep text-2xl font-bold sm:text-3xl">
        {title}
      </h1>
      <p className="mt-3 text-sm leading-6">{message}</p>
      {busy ? (
        <div className="mt-6 flex justify-center" aria-hidden="true">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
        </div>
      ) : (
        <Link
          href="/reservations"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          {t("backToList")}
        </Link>
      )}
    </section>
  );
}

function TicketPanel({
  reservation,
  hasGym,
  entryCode,
}: {
  reservation: Reservation;
  hasGym: boolean;
  entryCode?: string | null;
}) {
  if (reservation.status !== "reserved") {
    return <ReservationInactiveTicket status={reservation.status} />;
  }

  if (!hasGym) {
    return <ReservationUnavailableTicket />;
  }

  return (
    <ReservationAdmissionTicket
      reservation={reservation}
      entryCode={entryCode}
    />
  );
}

export function ReservationDetailView({
  gyms,
  reservationId,
}: ReservationDetailViewProps) {
  const t = useTranslations("ReservationDetail");
  const tReservation = useTranslations("Reservation");
  const [actionNotice, setActionNotice] = useState<{
    tone: keyof typeof noticeStyles;
    message: string;
  } | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [detailFetchState, setDetailFetchState] = useState<DetailFetchState>({
    status: "idle",
  });
  const detailAbortRef = useRef<AbortController | null>(null);
  const authSessionSnapshot = useSyncExternalStore(
    subscribeFirebaseAuthSession,
    getFirebaseAuthSessionSnapshot,
    getFirebaseAuthSessionServerSnapshot,
  );
  const reservationSnapshot = useSyncExternalStore(
    reservationRepository.subscribe,
    reservationRepository.getSnapshot,
    reservationRepository.getServerSnapshot,
  );
  const authSession = useMemo(
    () => parseFirebaseAuthSessionSnapshot(authSessionSnapshot),
    [authSessionSnapshot],
  );

  // reservationId가 바뀔 때마다 단건 API로 한 번 더 확인한다.
  // 직접 URL 진입 시 목록 구독이 도착하기 전에도 빠른 paint가 가능하고,
  // 본인 예약이 아닌 경우(404)를 명시적으로 안내할 수 있다.
  useEffect(() => {
    detailAbortRef.current?.abort();

    if (!authSession.ok) {
      detailAbortRef.current = null;
      return;
    }

    const controller = new AbortController();
    detailAbortRef.current = controller;

    // loading 상태는 별도 setState 없이, "idle 또는 다른 id의 결과만 있음"을
    // 표시 분기에서 loading으로 취급한다.

    let cancelled = false;
    (async () => {
      let result;
      try {
        result = await fetchUserReservation(reservationId, controller.signal);
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }
        if (detailAbortRef.current === controller && !cancelled) {
          detailAbortRef.current = null;
          setDetailFetchState({
            status: "failed",
            reservationId,
            kind: "error",
            message:
              error instanceof Error
                ? error.message
                : t("loadErrorDefault"),
          });
        }
        return;
      }

      if (detailAbortRef.current !== controller || cancelled) {
        return;
      }
      detailAbortRef.current = null;

      if (result.ok) {
        setDetailFetchState({
          status: "fetched",
          reservationId,
          reservation: result.reservation,
          detail: result.detail,
          gym: result.gym,
        });
        return;
      }

      setDetailFetchState({
        status: "failed",
        reservationId,
        kind: result.kind,
        message: result.message,
      });
    })();

    return () => {
      cancelled = true;
      controller.abort();
      if (detailAbortRef.current === controller) {
        detailAbortRef.current = null;
      }
    };
  }, [authSession, reservationId, t]);
  const currentMinuteValue = useCurrentMinuteValue();
  const reservationReadResult = useMemo(
    () => parseReservationSnapshot(reservationSnapshot),
    [reservationSnapshot],
  );
  const reservations = useMemo(
    () => (reservationReadResult.ok ? reservationReadResult.reservations : []),
    [reservationReadResult],
  );
  // 현재 reservationId에 매칭되는 단건 fetch 결과만 신뢰한다.
  // reservationId가 바뀐 직후의 이전 결과를 새 id에 잘못 적용하지 않기 위함.
  const currentDetailFetch = useMemo<DetailFetchState | null>(() => {
    if (!authSession.ok && authSession.reason !== "not-ready") {
      return {
        status: "failed",
        reservationId,
        kind: "auth-required",
        message: authSession.message,
      };
    }

    if (
      detailFetchState.status !== "idle" &&
      detailFetchState.reservationId === reservationId
    ) {
      return detailFetchState;
    }

    return null;
  }, [authSession, detailFetchState, reservationId]);

  const reservation = useMemo(() => {
    // 목록 구독을 source of truth로 두되, 목록에 아직 매칭이 없으면
    // 단건 fetch 결과를 fallback으로 사용해 초기 paint를 가속한다.
    const fromList = reservations.find((item) => item.id === reservationId);
    if (fromList) {
      return fromList;
    }
    return currentDetailFetch?.status === "fetched"
      ? currentDetailFetch.reservation
      : null;
  }, [reservationId, reservations, currentDetailFetch]);
  const gymsById = useMemo(
    () => {
      const map = new Map(gyms.map((gym) => [gym.id, gym]));
      if (
        currentDetailFetch?.status === "fetched" &&
        currentDetailFetch.gym
      ) {
        map.set(currentDetailFetch.gym.id, currentDetailFetch.gym);
      }
      return map;
    },
    [currentDetailFetch, gyms],
  );

  // 단건 fetch가 성공해 reservation이 결정된 경우엔 목록 구독이 not-ready여도 정상 표시.
  if (!reservation && !reservationReadResult.ok) {
    if (reservationReadResult.reason === "not-ready") {
      // 목록이 아직 못 왔어도 단건 fetch가 실패/완료 정보를 줬을 수 있으니 우선 검사.
      if (
        currentDetailFetch?.status === "failed" &&
        currentDetailFetch.kind === "not-found"
      ) {
        return (
          <DetailState
            title={t("notFoundTitle")}
            message={currentDetailFetch.message}
          />
        );
      }
      if (
        currentDetailFetch?.status === "failed" &&
        currentDetailFetch.kind !== "not-found"
      ) {
        return (
          <DetailState
            title={t("loadErrorTitle")}
            message={currentDetailFetch.message}
            tone="error"
          />
        );
      }
      return (
        <DetailState
          title={t("loadingTitle")}
          message={t("loadingDesc")}
          busy
        />
      );
    }

    return (
      <DetailState
        title={t("loadErrorTitle")}
        message={reservationReadResult.message}
        tone="error"
      />
    );
  }

  if (!reservation) {
    // 목록 구독은 ready지만 id 매칭이 없을 때 — 단건 fetch 결과로 사유를 구분한다.
    if (
      currentDetailFetch?.status === "failed" &&
      currentDetailFetch.kind === "not-found"
    ) {
      return (
        <DetailState
          title={t("notFoundTitle")}
          message={currentDetailFetch.message}
        />
      );
    }

    if (
      currentDetailFetch?.status === "failed" &&
      currentDetailFetch.kind !== "not-found"
    ) {
      return (
        <DetailState
          title={t("loadErrorTitle")}
          message={currentDetailFetch.message}
          tone="error"
        />
      );
    }

    if (currentDetailFetch === null) {
      // 아직 현재 id에 대한 단건 응답이 도착하지 않음 → loading.
      return (
        <DetailState
          title={t("loadingTitle")}
          message={t("loadingDesc")}
          busy
        />
      );
    }

    return (
      <DetailState
        title={t("notFoundTitle")}
        message={t("notFoundDesc")}
      />
    );
  }

  const gymSummary = getReservationGymSummary(
    gymsById,
    reservation,
    tReservation("missingGymName"),
  );
  const now = currentMinuteValue ? new Date(currentMinuteValue) : new Date();
  // 시간 의존(canCancel/deadline 통과)은 매 분 클라이언트에서 재평가해야 하므로,
  // 동일 SSOT 함수(createUserReservationDetail)로 화면용 detail을 재구성한다.
  // 서버 detail은 admission.entryCode 같은 비-시간 의존 필드 우선 사용에 활용한다.
  // useMemo는 early-return 이후라 Rules of Hooks 위반이라서 일반 계산으로 둔다.
  const liveDetail = createUserReservationDetail(reservation, { now });
  const serverDetail =
    currentDetailFetch?.status === "fetched" &&
    currentDetailFetch.reservation.id === reservation.id &&
    currentDetailFetch.reservation.status === reservation.status
      ? currentDetailFetch.detail
      : null;
  const cancellationDeadline = parseCancellationDeadline(
    liveDetail.cancellation.deadline,
  );
  const cancellationMessage = liveDetail.cancellation.message;
  const canCancelReservation = liveDetail.cancellation.canCancel;
  // entryCode는 서버 응답을 우선 사용하고, 없으면 클라이언트 SSOT 함수 결과로 폴백.
  const admissionEntryCode =
    serverDetail?.admission.entryCode ?? liveDetail.admission.entryCode;

  // 시설 주소를 사용자 clipboard에 복사한다. https/secure context 한정으로 동작하며
  // 실패 시 actionNotice로 그대로 보고한다(말없는 fallback 금지 규칙).
  const handleCopyAddress = async (address: string) => {
    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      setActionNotice({
        tone: "error",
        message: t("copyUnsupported"),
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(address);
      setActionNotice({
        tone: "success",
        message: t("copySuccess"),
      });
    } catch {
      setActionNotice({
        tone: "error",
        message: t("copyFailed"),
      });
    }
  };

  const handleCancel = async () => {
    if (isCancelling || !canCancelReservation) {
      return;
    }

    setIsCancelling(true);

    try {
      const result = await reservationRepository.cancel(reservation.id);

      // 목록 snapshot이 not-ready면 repository의 upsert가 early-return하므로
      // 단건 fetch fallback에 머무는 동안 화면이 cancelled 상태로 갱신되지 않는다.
      // result에 갱신된 reservation이 포함돼 있으면 detail도 동일 SSOT 함수로
      // 재구성해 함께 저장한다. (Repository 계약은 그대로 두고 클라이언트에서 통합)
      if ("reservation" in result && result.reservation) {
        const nextReservation = result.reservation;
        setDetailFetchState({
          status: "fetched",
          reservationId: nextReservation.id,
          reservation: nextReservation,
          detail: createUserReservationDetail(nextReservation, {
            now: new Date(),
          }),
          gym:
            currentDetailFetch?.status === "fetched"
              ? currentDetailFetch.gym
              : null,
        });
      }

      setActionNotice({
        tone: result.ok ? "success" : "error",
        message: result.message,
      });
      setConfirmingCancel(false);
    } catch {
      setActionNotice({
        tone: "error",
        message: t("cancelUnexpectedError"),
      });
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1fr_320px]">
      <div className="rounded-lg border border-line bg-white p-6 shadow-sm">
        <Link
          href="/reservations"
          className="rounded text-sm font-semibold text-accent-strong hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          {t("backToList")}
        </Link>

        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-accent-strong">
          {t("confirmationEyebrow")}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={`rounded-md px-2.5 py-1 text-xs font-bold ${reservationStatusBadgeStyles[reservation.status]}`}
          >
            {tReservation(`status.${reservation.status}`)}
          </span>
          <span className="text-xs font-semibold text-slate-400">
            {t("reservationNo")} {reservation.id.slice(0, 8)}
          </span>
          {gymSummary.isMissingFromCurrentData ? (
            <span className="rounded-md bg-warning/10 px-2.5 py-1 text-xs font-bold text-warning">
              {t("missingGymBadge")}
            </span>
          ) : null}
        </div>

        <h1 className="mt-3 break-keep text-3xl font-bold text-slate-950">
          {gymSummary.name}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {t("confirmationDesc", {
            date: reservation.date,
            time: reservation.time,
            sport: reservation.sport,
          })}
        </p>

        {gymSummary.isMissingFromCurrentData ? (
          <p className="mt-5 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm leading-6 text-warning">
            {t("missingGymInline", { gymId: reservation.gymId })}
          </p>
        ) : null}

        {actionNotice ? (
          <div
            role="alert"
            className={`mt-5 rounded-md border px-4 py-3 text-sm font-semibold ${noticeStyles[actionNotice.tone]}`}
          >
            {actionNotice.message}
          </div>
        ) : null}

        <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("summaryHeading")}
        </p>
        <dl className="mt-2 grid gap-4 rounded-md border border-line bg-slate-50 px-4 py-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-500">
              {t("gymLabel")}
            </dt>
            <dd className="mt-1 text-sm font-semibold text-slate-950">
              {gymSummary.name}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-500">
              {t("sportLabel")}
            </dt>
            <dd className="mt-1 text-sm font-semibold text-slate-950">
              {reservation.sport}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-500">
              {t("dateTimeLabel")}
            </dt>
            <dd className="mt-1 text-sm font-semibold text-slate-950">
              {reservation.date} {reservation.time}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-500">
              {t("priceLabel")}
            </dt>
            <dd className="mt-1 text-sm font-semibold text-slate-950">
              {formatGymPrice(reservation.price)}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-semibold uppercase text-slate-500">
              {t("cancelDeadlineLabel")}
            </dt>
            <dd className="mt-1 text-sm font-semibold text-slate-950">
              {reservation.status === "reserved" &&
              canCancelReservation &&
              cancellationDeadline
                ? t("cancelDeadlineUntil", {
                    deadline:
                      formatCancellationDeadline(cancellationDeadline),
                  })
                : reservation.status === "reserved"
                  ? cancellationMessage
                  : "—"}
            </dd>
          </div>
        </dl>

        <div className="mt-3 rounded-md border border-line bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
          <p className="font-semibold text-slate-700">{t("referenceTitle")}</p>
          <dl className="mt-2 grid gap-2 sm:grid-cols-[120px_1fr]">
            <dt className="text-slate-500">{t("createdAtLabel")}</dt>
            <dd className="text-slate-800">
              {formatReservationCreatedAt(reservation.createdAt)}
            </dd>
            <dt className="text-slate-500">{t("reservationIdLabel")}</dt>
            <dd className="break-all font-mono text-slate-800">
              {reservation.id}
            </dd>
          </dl>
        </div>

        {gymSummary.gym ? (
          <div className="mt-6 rounded-md border border-line bg-slate-50 px-4 py-3">
            <h2 className="text-sm font-bold text-slate-950">
              {t("facilityInfoTitle")}
            </h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">{t("addressLabel")}</dt>
                <dd className="mt-1 text-slate-800">
                  {gymSummary.gym.address}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("openHoursLabel")}</dt>
                <dd className="mt-1 text-slate-800">
                  {gymSummary.gym.openHours}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("closedDaysLabel")}</dt>
                <dd className="mt-1 text-slate-800">
                  {gymSummary.gym.closedDays.join(", ")}
                </dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/gyms/${gymSummary.gym.id}`}
                className="inline-flex h-10 items-center justify-center rounded-md border border-line-strong bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                {t("gymDetailLink")}
              </Link>
              {/* 이용 당일 시설로 가는 동선을 줄인다. clipboard와 외부 지도 링크는
                  추가 권한이나 외부 의존을 만들지 않는다. .ics 캘린더 다운로드는
                  timezone/end-time 계산이 별도 작업으로 필요하므로 이번엔 제외. */}
              <button
                type="button"
                onClick={() => handleCopyAddress(gymSummary.gym!.address)}
                className="inline-flex h-10 items-center justify-center rounded-md border border-line-strong bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                {t("copyAddress")}
              </button>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(gymSummary.gym.address)}`}
                target="_blank"
                rel="noreferrer"
                aria-label={t("directionsAria", { name: gymSummary.name })}
                className="inline-flex h-10 items-center justify-center rounded-md border border-line-strong bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                {t("directions")}
              </a>
              {reservation.status === "reserved" ? (
                // 같은 시설·같은 종목으로 다른 시간을 추가 예약하는 흐름을 가속하기 위해
                // sport만 prefill한다. date/time은 새 예약이므로 비워둔다.
                <Link
                  href={`/reserve/${encodeURIComponent(gymSummary.gym.id)}?sport=${encodeURIComponent(reservation.sport)}`}
                  aria-label={t("addReservationAria", {
                    name: gymSummary.name,
                    sport: reservation.sport,
                  })}
                  className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                >
                  {t("addReservation")}
                </Link>
              ) : (
                // 이용 완료/취소된 예약 상세에서도 같은 시설로 다시 예약 진입을 제공.
                // 현재 예약의 sport/date/time을 query로 전달해 reserve 폼 초기값에 활용한다.
                // 라벨은 reservations-view의 예약 카드와 동일하게 "다시 예약"으로 통일한다.
                <Link
                  href={`/reserve/${encodeURIComponent(gymSummary.gym.id)}?sport=${encodeURIComponent(reservation.sport)}&date=${encodeURIComponent(reservation.date)}&time=${encodeURIComponent(reservation.time)}`}
                  aria-label={t("rebookAria", {
                    name: gymSummary.name,
                    sport: reservation.sport,
                  })}
                  className="inline-flex h-10 items-center justify-center rounded-md border border-accent/30 bg-accent-tint px-4 text-sm font-semibold text-accent-strong transition hover:border-accent hover:bg-accent-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                >
                  {t("rebook")}
                </Link>
              )}
            </div>
          </div>
        ) : null}

        {reservation.status === "reserved" ? (
          <div className="mt-6 rounded-md border border-line bg-white px-4 py-3">
            <h2 className="text-sm font-bold text-slate-950">
              {t("cancelSectionTitle")}
            </h2>
            {canCancelReservation ? (
              <>
                {confirmingCancel ? (
                  <div
                    className="mt-4 rounded-md border border-error/30 bg-error/10 px-4 py-3 text-sm text-error"
                    role="alert"
                  >
                    <p className="font-semibold">{t("cancelConfirmTitle")}</p>
                    <p className="mt-1 text-xs text-error">
                      {reservation.date} {reservation.time} ·{" "}
                      {reservation.sport}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleCancel}
                        disabled={isCancelling}
                        className="h-10 rounded-md bg-error px-3 text-sm font-semibold text-white transition hover:bg-error/90 disabled:cursor-not-allowed disabled:bg-error/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                      >
                        {isCancelling ? t("cancelling") : t("cancelConfirm")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingCancel(false)}
                        disabled={isCancelling}
                        className="h-10 rounded-md border border-error/30 bg-white px-3 text-sm font-semibold text-error transition hover:bg-error/15 disabled:cursor-not-allowed disabled:text-error/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                      >
                        {t("keep")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setActionNotice(null);
                      setConfirmingCancel(true);
                    }}
                    className="mt-4 h-10 rounded-md border border-error/30 px-4 text-sm font-semibold text-error transition hover:bg-error/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                  >
                    {t("cancelReservation")}
                  </button>
                )}
              </>
            ) : (
              <p
                className="mt-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm font-semibold text-warning"
                role="status"
              >
                {cancellationMessage}
              </p>
            )}
          </div>
        ) : null}
      </div>

      <aside className="rounded-lg border border-line bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-accent-strong">
          {t("ticketEyebrow")}
        </p>
        <h2 className="mt-2 text-xl font-bold text-slate-950">
          {t("ticketTitle")}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {t("ticketDesc")}
        </p>
        <div className="mt-5">
          <TicketPanel
            reservation={reservation}
            hasGym={!gymSummary.isMissingFromCurrentData}
            entryCode={admissionEntryCode}
          />
        </div>
      </aside>
    </section>
  );
}
