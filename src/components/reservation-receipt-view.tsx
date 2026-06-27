"use client";

import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  getFirebaseAuthSessionServerSnapshot,
  getFirebaseAuthSessionSnapshot,
  parseFirebaseAuthSessionSnapshot,
  subscribeFirebaseAuthSession,
} from "@/lib/firebase-auth-session";
import { formatGymPrice } from "@/lib/gym-utils";
import { getReservationEntryCode } from "@/lib/reservation-detail";
import {
  fetchUserReservation,
  type FetchUserReservationFailureKind,
} from "@/lib/reservation-detail-client";
import { fetchUserProfile } from "@/lib/user-profile-client";
import {
  formatReservationCreatedAt,
  getReservationGymSummary,
  reservationStatusBadgeStyles,
  reservationStatusLabel,
} from "@/components/reservation-ticket";
import type { Gym, Reservation } from "@/types/domain";
import type { UserProfile } from "@/lib/user-profile";

type ReservationReceiptViewProps = {
  gyms: Gym[];
  reservationId: string;
};

// 예약 단건 + 회원정보를 함께 받아온 결과. 회원정보는 실패해도 화면을 막지 않고
// 이름/연락처만 "—"로 떨어뜨린다(예약 정보가 본질이므로).
type ReceiptFetchState =
  | { status: "idle" }
  | {
      status: "fetched";
      reservationId: string;
      reservation: Reservation;
      gym: Gym | null;
      profile: UserProfile | null;
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

// 섹션 헤더: 제목(20px) + 펼침 상태를 나타내는 장식용 ^ 아이콘.
function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-200 pb-3">
      <h2 className="text-[20px] font-bold text-slate-900">{title}</h2>
      <svg
        viewBox="0 0 16 16"
        className="h-4 w-4 text-slate-400"
        aria-hidden="true"
      >
        <path
          d="M3 10l5-5 5 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// 라벨(좌, 회색) + 값(우) 한 줄. 값은 14px.
function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-4 py-2.5">
      <dt className="text-[14px] text-slate-500">{label}</dt>
      <dd className="text-[14px] font-medium text-slate-800">{children}</dd>
    </div>
  );
}

function StatusMessage({ title, message }: { title: string; message: string }) {
  return (
    <div className="mx-auto w-[1200px] max-w-full rounded-2xl bg-white px-12 py-16 text-center shadow-sm">
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>
    </div>
  );
}

export function ReservationReceiptView({
  gyms,
  reservationId,
}: ReservationReceiptViewProps) {
  const [fetchState, setFetchState] = useState<ReceiptFetchState>({
    status: "idle",
  });
  const authSessionSnapshot = useSyncExternalStore(
    subscribeFirebaseAuthSession,
    getFirebaseAuthSessionSnapshot,
    getFirebaseAuthSessionServerSnapshot,
  );
  const authSession = useMemo(
    () => parseFirebaseAuthSessionSnapshot(authSessionSnapshot),
    [authSessionSnapshot],
  );

  // 예약 단건과 회원정보를 병렬로 받아온다. 예약 조회가 실패하면 그 사유를 그대로
  // 노출하고(404/권한/일반 오류), 회원정보 실패는 예약 화면을 막지 않는다.
  useEffect(() => {
    if (!authSession.ok) {
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      let reservationResult;
      try {
        reservationResult = await fetchUserReservation(
          reservationId,
          controller.signal,
        );
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }
        if (!cancelled) {
          setFetchState({
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

      if (cancelled) {
        return;
      }

      if (!reservationResult.ok) {
        setFetchState({
          status: "failed",
          reservationId,
          kind: reservationResult.kind,
          message: reservationResult.message,
        });
        return;
      }

      // 회원정보는 부가 정보라 실패해도 null로 두고 진행한다(말없는 fallback이 아니라
      // 화면에 "—"로 명시된다).
      let profile: UserProfile | null = null;
      try {
        const profileResult = await fetchUserProfile(controller.signal);
        if (profileResult.ok) {
          profile = profileResult.profile;
        }
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }
      }

      if (cancelled) {
        return;
      }

      setFetchState({
        status: "fetched",
        reservationId,
        reservation: reservationResult.reservation,
        gym: reservationResult.gym,
        profile,
      });
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [authSession, reservationId]);

  if (!authSession.ok && authSession.reason !== "not-ready") {
    return (
      <StatusMessage title="로그인이 필요합니다" message={authSession.message} />
    );
  }

  if (fetchState.status === "idle" || fetchState.reservationId !== reservationId) {
    return (
      <StatusMessage
        title="예약 내역을 불러오고 있습니다"
        message="잠시만 기다려 주세요."
      />
    );
  }

  if (fetchState.status === "failed") {
    return (
      <StatusMessage
        title={
          fetchState.kind === "not-found"
            ? "예약을 찾을 수 없습니다"
            : "예약 내역을 불러오지 못했습니다"
        }
        message={fetchState.message}
      />
    );
  }

  const { reservation, gym, profile } = fetchState;
  const gymsById = new Map(gyms.map((item) => [item.id, item]));
  if (gym) {
    gymsById.set(gym.id, gym);
  }
  const gymSummary = getReservationGymSummary(
    gymsById,
    reservation,
    "등록되지 않은 시설",
  );
  const entryCode =
    reservation.status === "reserved"
      ? getReservationEntryCode(reservation)
      : null;

  const dash = "—";
  const profileName = profile?.name?.trim() ? profile.name : dash;
  const profileBirth = profile?.birthDate?.trim() ? profile.birthDate : dash;
  const profilePhone = profile?.phone?.trim() ? profile.phone : dash;

  return (
    <div className="mx-auto flex w-[1200px] max-w-full flex-col gap-8">
      {/* 상단 배너 카드 1200×160 — 브랜드 네이비(accent) */}
      <header className="flex h-40 items-center rounded-2xl bg-accent px-12 text-white shadow-sm">
        <div>
          <h1 className="text-[32px] font-bold leading-tight">예약 내역</h1>
          <p className="mt-2 text-[20px] text-white/85">
            예약 진행 상황과 결과를 확인하세요
          </p>
        </div>
      </header>

      {/* 하단 본문 박스 1200×min 1600 */}
      <section className="min-h-[1600px] rounded-2xl bg-white px-12 py-12 shadow-sm">
        <h2 className="text-[28px] font-bold text-slate-900">예약 내역</h2>
        <p className="mt-2 text-[16px] text-slate-500">
          나의 예약 내역을 확인하세요.
        </p>

        <div className="mt-10 flex flex-col gap-12">
          {/* 예약자 정보 */}
          <div>
            <SectionHeader title="예약자 정보" />
            <dl className="mt-4">
              <Row label="예약자명">{profileName}</Row>
              <Row label="생년월일">{profileBirth}</Row>
              <Row label="연락처">{profilePhone}</Row>
            </dl>
          </div>

          {/* 예약 확인 */}
          <div>
            <SectionHeader title="예약 확인" />
            <dl className="mt-4">
              <Row label="예약 상태">
                <span
                  className={`inline-flex rounded-md px-2.5 py-1 text-xs font-bold ${reservationStatusBadgeStyles[reservation.status]}`}
                >
                  {reservationStatusLabel[reservation.status]}
                </span>
              </Row>
              <Row label="예약 일시">
                {reservation.date} {reservation.time}
              </Row>
              <Row label="예약 시설명">{gymSummary.name}</Row>
              <Row label="예약 시설 주소">
                {gymSummary.gym ? gymSummary.gym.address : dash}
              </Row>
              <Row label="예약 번호">{reservation.id}</Row>
              <Row label="예약 생성일">
                {formatReservationCreatedAt(reservation.createdAt)}
              </Row>
            </dl>
          </div>

          {/* 세부 예약 내역 */}
          <div>
            <SectionHeader title="세부 예약 내역" />
            <dl className="mt-4">
              <Row label="종목">{reservation.sport}</Row>
              <Row label="운영 시간">
                {gymSummary.gym ? gymSummary.gym.openHours : dash}
              </Row>
              <Row label="휴무일">
                {gymSummary.gym && gymSummary.gym.closedDays.length > 0
                  ? gymSummary.gym.closedDays.join(", ")
                  : dash}
              </Row>
              <Row label="현장 확인 코드">
                {entryCode ? (
                  <span className="font-mono tracking-wide text-accent-strong">
                    {entryCode}
                  </span>
                ) : (
                  dash
                )}
              </Row>
            </dl>
          </div>

          {/* 결제 내역 */}
          <div>
            <SectionHeader title="결제 내역" />
            <dl className="mt-4">
              <div className="grid grid-cols-[160px_1fr] gap-4 rounded-lg bg-slate-50 px-4 py-3">
                <dt className="self-center text-[14px] text-slate-500">
                  현장 결제 예정 금액
                </dt>
                <dd className="self-center text-[16px] font-bold text-accent-strong">
                  {formatGymPrice(reservation.price)}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>
    </div>
  );
}
