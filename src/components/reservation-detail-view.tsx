"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
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
  reservationStatusLabel,
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
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-rose-200 bg-rose-50 text-rose-800",
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
  eyebrow = "예약 상세",
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
  const isError = tone === "error";

  return (
    <section
      className={`mx-auto w-full max-w-4xl rounded-lg border p-8 text-center shadow-sm ${
        isError
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-slate-200 bg-white text-slate-950"
      }`}
      aria-live={busy ? "polite" : undefined}
      aria-busy={busy || undefined}
      role={isError ? "alert" : undefined}
    >
      <p
        className={`text-sm font-semibold ${isError ? "" : "text-sky-700"}`}
      >
        {eyebrow}
      </p>
      <h1 className="mt-2 break-keep text-2xl font-bold sm:text-3xl">
        {title}
      </h1>
      <p className="mt-3 text-sm leading-6">{message}</p>
      {busy ? (
        <div className="mt-6 flex justify-center" aria-hidden="true">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-sky-600" />
        </div>
      ) : (
        <Link
          href="/reservations"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-md bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
        >
          내 예약으로
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
                : "예약 상세를 불러오지 못했습니다.",
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
  }, [authSession, reservationId]);
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
            title="예약을 찾을 수 없습니다"
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
            title="예약 정보를 불러오지 못했습니다"
            message={currentDetailFetch.message}
            tone="error"
          />
        );
      }
      return (
        <DetailState
          title="예약 정보를 불러오고 있습니다"
          message="현재 세션에 연결된 예약을 확인하는 중입니다."
          busy
        />
      );
    }

    return (
      <DetailState
        title="예약 정보를 불러오지 못했습니다"
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
          title="예약을 찾을 수 없습니다"
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
          title="예약 정보를 불러오지 못했습니다"
          message={currentDetailFetch.message}
          tone="error"
        />
      );
    }

    if (currentDetailFetch === null) {
      // 아직 현재 id에 대한 단건 응답이 도착하지 않음 → loading.
      return (
        <DetailState
          title="예약 정보를 불러오고 있습니다"
          message="현재 세션에 연결된 예약을 확인하는 중입니다."
          busy
        />
      );
    }

    return (
      <DetailState
        title="예약을 찾을 수 없습니다"
        message="현재 세션에 연결된 예약 중 요청한 예약번호가 없습니다."
      />
    );
  }

  const gymSummary = getReservationGymSummary(gymsById, reservation);
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
        message:
          "이 브라우저에서는 주소 복사를 지원하지 않습니다. 주소를 길게 눌러 직접 복사해 주세요.",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(address);
      setActionNotice({
        tone: "success",
        message: "시설 주소를 복사했습니다.",
      });
    } catch {
      setActionNotice({
        tone: "error",
        message:
          "주소 복사에 실패했습니다. 주소를 길게 눌러 직접 복사해 주세요.",
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
        message: "예약 취소 중 예상하지 못한 오류가 발생했습니다.",
      });
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1fr_320px]">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <Link
          href="/reservations"
          className="rounded text-sm font-semibold text-sky-700 hover:text-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
        >
          내 예약으로
        </Link>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span
            className={`rounded-md px-2.5 py-1 text-xs font-bold ${reservationStatusBadgeStyles[reservation.status]}`}
          >
            {reservationStatusLabel[reservation.status]}
          </span>
          <span className="text-xs font-semibold text-slate-400">
            예약번호 {reservation.id.slice(0, 8)}
          </span>
          {gymSummary.isMissingFromCurrentData ? (
            <span className="rounded-md bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
              시설 정보 제외됨
            </span>
          ) : null}
        </div>

        <h1 className="mt-3 break-keep text-3xl font-bold text-slate-950">
          {gymSummary.name}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {reservation.date} {reservation.time}에 이용할 {reservation.sport}{" "}
          예약 상세입니다.
        </p>

        {gymSummary.isMissingFromCurrentData ? (
          <p className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
            이 예약의 체육관 ID({reservation.gymId})는 현재 운영 중인 시설
            목록에 없습니다. 예약 기록은 유지되며 취소 가능 조건을 만족하면
            취소할 수 있습니다.
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

        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-500">
              체육관
            </dt>
            <dd className="mt-1 text-sm font-semibold text-slate-950">
              {gymSummary.name}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-500">
              종목
            </dt>
            <dd className="mt-1 text-sm font-semibold text-slate-950">
              {reservation.sport}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-500">
              이용 일시
            </dt>
            <dd className="mt-1 text-sm font-semibold text-slate-950">
              {reservation.date} {reservation.time}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-500">
              결제 금액
            </dt>
            <dd className="mt-1 text-sm font-semibold text-slate-950">
              {formatGymPrice(reservation.price)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-500">
              예약일
            </dt>
            <dd className="mt-1 text-sm font-semibold text-slate-950">
              {formatReservationCreatedAt(reservation.createdAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-500">
              예약 ID
            </dt>
            <dd className="mt-1 break-all font-mono text-sm text-slate-950">
              {reservation.id}
            </dd>
          </div>
        </dl>

        {gymSummary.gym ? (
          <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
            <h2 className="text-sm font-bold text-slate-950">시설 정보</h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">주소</dt>
                <dd className="mt-1 text-slate-800">
                  {gymSummary.gym.address}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">운영시간</dt>
                <dd className="mt-1 text-slate-800">
                  {gymSummary.gym.openHours}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">휴관일</dt>
                <dd className="mt-1 text-slate-800">
                  {gymSummary.gym.closedDays.join(", ")}
                </dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/gyms/${gymSummary.gym.id}`}
                className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-sky-400 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
              >
                체육관 상세
              </Link>
              {/* 이용 당일 시설로 가는 동선을 줄인다. clipboard와 외부 지도 링크는
                  추가 권한이나 외부 의존을 만들지 않는다. .ics 캘린더 다운로드는
                  timezone/end-time 계산이 별도 작업으로 필요하므로 이번엔 제외. */}
              <button
                type="button"
                onClick={() => handleCopyAddress(gymSummary.gym!.address)}
                className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-sky-400 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
              >
                주소 복사
              </button>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(gymSummary.gym.address)}`}
                target="_blank"
                rel="noreferrer"
                aria-label={`${gymSummary.name} 길찾기 (외부 지도 새 탭)`}
                className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-sky-400 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
              >
                길찾기
              </a>
              {reservation.status === "reserved" ? (
                <Link
                  href={`/reserve/${gymSummary.gym.id}`}
                  className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                >
                  추가 예약
                </Link>
              ) : (
                // 이용 완료/취소된 예약 상세에서도 같은 시설로 다시 예약 진입을 제공.
                // 현재 예약의 sport/date/time을 query로 전달해 작업 3에서 폼 초기값에 활용한다.
                <Link
                  href={`/reserve/${encodeURIComponent(gymSummary.gym.id)}?sport=${encodeURIComponent(reservation.sport)}&date=${encodeURIComponent(reservation.date)}&time=${encodeURIComponent(reservation.time)}`}
                  aria-label={`${gymSummary.name} ${reservation.sport} 같은 조건으로 다시 예약`}
                  className="inline-flex h-10 items-center justify-center rounded-md border border-sky-300 bg-sky-50 px-4 text-sm font-semibold text-sky-800 transition hover:border-sky-500 hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                >
                  같은 시설 예약하기
                </Link>
              )}
            </div>
          </div>
        ) : null}

        {reservation.status === "reserved" ? (
          <div className="mt-6 rounded-md border border-slate-200 bg-white px-4 py-3">
            <h2 className="text-sm font-bold text-slate-950">예약 취소</h2>
            {canCancelReservation ? (
              <>
                {cancellationDeadline ? (
                  <p className="mt-2 text-sm text-slate-600">
                    {formatCancellationDeadline(cancellationDeadline)}까지 취소할
                    수 있습니다.
                  </p>
                ) : null}
                {confirmingCancel ? (
                  <div
                    className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
                    role="alert"
                  >
                    <p className="font-semibold">이 예약을 취소할까요?</p>
                    <p className="mt-1 text-xs text-rose-600">
                      {reservation.date} {reservation.time} ·{" "}
                      {reservation.sport}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleCancel}
                        disabled={isCancelling}
                        className="h-10 rounded-md bg-rose-700 px-3 text-sm font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
                      >
                        {isCancelling ? "취소 중" : "취소 확정"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingCancel(false)}
                        disabled={isCancelling}
                        className="h-10 rounded-md border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
                      >
                        유지
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
                    className="mt-4 h-10 rounded-md border border-rose-200 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
                  >
                    예약 취소
                  </button>
                )}
              </>
            ) : (
              <p
                className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800"
                role="status"
              >
                {cancellationMessage}
              </p>
            )}
          </div>
        ) : null}
      </div>

      <aside className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-emerald-700">입장권</p>
        <h2 className="mt-2 text-xl font-bold text-slate-950">
          모바일 입장권
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          예약 완료 상태의 예약만 현장 확인 코드가 활성화됩니다.
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
