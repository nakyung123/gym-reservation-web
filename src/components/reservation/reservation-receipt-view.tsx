"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { AlertModal } from "@/components/ui/alert-modal";
import {
  getFirebaseAuthSessionServerSnapshot,
  getFirebaseAuthSessionSnapshot,
  parseFirebaseAuthSessionSnapshot,
  subscribeFirebaseAuthSession,
} from "@/lib/firebase-auth-session";
import { formatGymPrice } from "@/lib/gym-utils";
import { PAYMENT_METHOD_LABELS } from "@/lib/domain-constants";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import {
  fetchUserReservation,
  type FetchUserReservationFailureKind,
} from "@/lib/reservation-detail-client";
import { fetchUserProfile } from "@/lib/user-profile-client";
import { reservationRepository } from "@/lib/reservation-repository-provider";
import {
  getReservationGymSummary,
  reservationDisplayNumber,
  reservationStatusLabel,
} from "@/components/reservation/reservation-ticket";
import type { UserReservationDetail } from "@/lib/reservation-detail";
import type { Gym, Reservation } from "@/types/domain";
import type { UserProfile } from "@/lib/user-profile";

import { isAbortError } from "@/lib/async-error";
type ReservationReceiptViewProps = {
  gyms: Gym[];
  reservationId: string;
};

// 예약 단건 + 상세(취소 가능 여부) + 회원정보. 회원정보는 실패해도 화면을 막지 않고
// 이름/연락처만 "—"로 떨어뜨린다(예약 정보가 본질이므로).
type ReceiptFetchState =
  | { status: "idle" }
  | {
      status: "fetched";
      reservationId: string;
      reservation: Reservation;
      detail: UserReservationDetail;
      gym: Gym | null;
      profile: UserProfile | null;
    }
  | {
      status: "failed";
      reservationId: string;
      kind: FetchUserReservationFailureKind;
      message: string;
    };

type CancelState =
  | { kind: "idle" }
  | { kind: "confirm" }
  | { kind: "submitting" }
  | { kind: "done" }
  | { kind: "error"; message: string };


// 예약 생성일 표기(예약 일시와 동일한 YYYY-MM-DD HH:MM). 잘못된 ISO면 앞 10자 폴백.
function formatCreatedDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}`;
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
    <div className="mx-auto w-[1200px] max-w-full rounded-2xl border border-line bg-white px-12 py-16 text-center shadow-sm">
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
  const [cancelState, setCancelState] = useState<CancelState>({ kind: "idle" });
  const router = useRouter();
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
        detail: reservationResult.detail,
        gym: reservationResult.gym,
        profile,
      });
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [authSession, reservationId]);

  // 예약 취소(현장 결제 예약). 성공하면 화면의 예약 상태를 취소로 갱신한다.
  const handleCancel = async () => {
    if (fetchState.status !== "fetched") return;
    setCancelState({ kind: "submitting" });
    try {
      const result = await reservationRepository.cancel(
        fetchState.reservation.id,
      );
      if (result.ok) {
        setFetchState((prev) =>
          prev.status === "fetched"
            ? { ...prev, reservation: result.reservation }
            : prev,
        );
        // 취소 완료 알림을 띄우고, 사용자가 확인하면 마이페이지(예약내역)로 이동한다.
        setCancelState({ kind: "done" });
        return;
      }
      setCancelState({ kind: "error", message: result.message });
    } catch {
      setCancelState({
        kind: "error",
        message: "예약 취소 중 오류가 발생했습니다. 다시 시도해 주세요.",
      });
    }
  };

  if (!authSession.ok && authSession.reason !== "not-ready") {
    return (
      <StatusMessage title="로그인이 필요합니다" message={authSession.message} />
    );
  }

  if (fetchState.status === "idle" || fetchState.reservationId !== reservationId) {
    return (
      <StatusMessage
        title="페이지를 불러오는 중입니다."
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

  const { reservation, detail, gym, profile } = fetchState;
  const gymsById = new Map(gyms.map((item) => [item.id, item]));
  if (gym) {
    gymsById.set(gym.id, gym);
  }
  const gymSummary = getReservationGymSummary(
    gymsById,
    reservation,
    "등록되지 않은 시설",
  );

  const dash = "—";
  const profileName = profile?.name?.trim() ? profile.name : dash;
  const profileBirth = profile?.birthDate?.trim() ? profile.birthDate : dash;
  // 연락처는 예약 시 입력한 이 예약 건의 값을 우선 표시하고,
  // 연락처 저장 도입 이전 예약은 회원 프로필 연락처로 폴백한다.
  const contactPhone =
    reservation.phone?.trim() ||
    (profile?.phone?.trim() ? profile.phone : dash);
  // 취소 성공 후 reservation.status는 갱신되지만 detail은 최초 조회값이므로,
  // 현재 상태가 '예약 완료(reserved)'인지도 함께 확인해 재취소를 막는다.
  const canCancel =
    reservation.status === "reserved" && detail.cancellation.canCancel;
  const isSubmitting = cancelState.kind === "submitting";
  // 결제 수단 도입 이전 예약은 null → '정보 없음'.
  const paymentLabel = reservation.paymentMethod
    ? PAYMENT_METHOD_LABELS[reservation.paymentMethod]
    : "정보 없음";

  return (
    <div className="mx-auto flex w-[1200px] max-w-full flex-col gap-8">
      {/* 마이페이지와 동일한 페이지 헤더: breadcrumb(홈/마이페이지/예약 상세 내역) + h1 + 설명 */}
      <header>
        <nav aria-label="breadcrumb" className="text-[13px] text-muted">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link href="/" className="transition hover:text-accent-strong">
                홈
              </Link>
            </li>
            <li aria-hidden="true" className="text-line-strong">
              /
            </li>
            <li>
              <Link
                href="/mypage"
                className="transition hover:text-accent-strong"
              >
                마이페이지
              </Link>
            </li>
            <li aria-hidden="true" className="text-line-strong">
              /
            </li>
            <li className="font-semibold text-foreground">예약 상세 내역</li>
          </ol>
        </nav>
        <h1 className="mt-3 text-[28px] font-bold text-foreground sm:text-[32px]">
          예약 상세 내역
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          예약 정보와 결제 내역을 확인하세요.
        </p>
      </header>

      {/* 본문: 박스별 접기/펼치기 카드 스택 */}
      <div className="flex flex-col gap-5">
        {/* 예약자 정보 */}
        <CollapsibleSection title="예약자 정보">
          <dl>
            <Row label="예약자명">{profileName}</Row>
            <Row label="생년월일">{profileBirth}</Row>
            <Row label="연락처">{contactPhone}</Row>
          </dl>
        </CollapsibleSection>

        {/* 예약 확인 */}
        <CollapsibleSection title="예약 확인">
          <dl>
            <Row label="예약 상태">
              {reservationStatusLabel[reservation.status]}
            </Row>
            <Row label="예약 종목">{reservation.sport}</Row>
            <Row label="예약 일시">
              {reservation.date} {reservation.time}
            </Row>
            <Row label="예약 시설명">{gymSummary.name}</Row>
            <Row label="예약 시설 주소">
              {gymSummary.gym ? gymSummary.gym.address : dash}
            </Row>
            <Row label="예약 번호">
              {reservationDisplayNumber(reservation)}
            </Row>
            <Row label="예약 생성일">
              {formatCreatedDateTime(reservation.createdAt)}
            </Row>
          </dl>
        </CollapsibleSection>

        {/* 결제 내역 — 하단 목록으로/예약 취소 버튼도 이 흰 박스 안에 둔다. */}
        <CollapsibleSection title="결제 내역">
          <dl className="flex flex-col gap-3">
            <Row label="결제 수단">{paymentLabel}</Row>
            <div className="grid grid-cols-[160px_1fr] gap-4 rounded-lg bg-slate-50 px-4 py-3">
              <dt className="self-center text-[14px] text-slate-500">
                현장 결제 예정 금액
              </dt>
              <dd className="self-center text-[16px] font-bold text-accent-strong">
                {formatGymPrice(reservation.price)}
              </dd>
            </div>
          </dl>

          {/* 구분선(그리드 너비, 위아래 32px) + 목록으로(좌)/예약 취소(우). 버튼 아래 60px
              (컨테이너 pb-9=36px + 카드 py-6 하단 24px). 두 버튼은 동일 스타일. */}
          <div className="mt-8 border-t border-line pt-8 pb-9">
            {cancelState.kind === "error" ? (
              <p
                role="alert"
                className="mb-4 rounded-md border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error"
              >
                {cancelState.message}
              </p>
            ) : null}
            {/* 취소 가능한 예약만 '예약 취소'를 노출한다. 취소 완료·불가 예약은
                '목록으로'만 남기고 가운데 정렬한다. */}
            <div
              className={`flex items-center gap-3 ${
                canCancel ? "justify-between" : "justify-start"
              }`}
            >
              <Link
                href="/mypage"
                className="inline-flex h-[44px] w-[94px] items-center justify-center rounded-md border border-line-strong bg-white text-[14px] font-semibold text-slate-700 transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                목록으로
              </Link>
              {canCancel ? (
                <button
                  type="button"
                  onClick={() => setCancelState({ kind: "confirm" })}
                  disabled={isSubmitting}
                  className="inline-flex h-[44px] w-[94px] items-center justify-center rounded-md border border-line-strong bg-white text-[14px] font-semibold text-slate-700 transition hover:border-accent hover:text-accent-strong disabled:cursor-not-allowed disabled:text-subtle disabled:hover:border-line-strong disabled:hover:text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {isSubmitting ? "취소 중…" : "예약 취소"}
                </button>
              ) : null}
            </div>
          </div>
        </CollapsibleSection>
      </div>

      {/* 예약 취소 확인 — 통일 알림창(confirm 변형: 닫기 | 예약 취소) */}
      {cancelState.kind === "confirm" || cancelState.kind === "submitting" ? (
        <AlertModal
          message="예약을 취소하시겠습니까?"
          onClose={() => {
            if (!isSubmitting) setCancelState({ kind: "idle" });
          }}
          confirm={{
            confirmLabel: "예약 취소",
            onConfirm: handleCancel,
            busy: isSubmitting,
            busyLabel: "취소 중…",
          }}
        />
      ) : null}

      {/* 취소 완료 — 확인 시 마이페이지(예약내역)로 이동 */}
      {cancelState.kind === "done" ? (
        <AlertModal
          message="예약 취소가 완료되었습니다."
          onClose={() => router.push("/mypage")}
        />
      ) : null}
    </div>
  );
}
