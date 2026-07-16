"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAdminCustomerDetail } from "@/lib/admin/admin-customer-client";
import {
  createAdminCustomerNote,
  deleteAdminCustomerNote,
} from "@/lib/admin/admin-customer-note-client";
import { fetchAdminReservations } from "@/lib/admin/admin-reservation-client";
import {
  providerLabel,
  type CustomerDetail,
} from "@/lib/admin/customer";
import {
  CUSTOMER_NOTE_MAX_LENGTH,
  validateCustomerNoteBody,
  type CustomerNote,
} from "@/lib/admin/customer-note";
import { formatAdminDate, formatAdminDateTime } from "@/lib/admin/format";
import { formatGymPrice } from "@/lib/gym-utils";
import type { Reservation } from "@/types/domain";
import {
  AdminButtonSpinner,
  AdminEmptyState,
  AdminLoadingRow,
} from "@/components/admin/admin-async-state";
import { AdminErrorNotice } from "@/components/admin/admin-ui";
import { Button, ButtonLink } from "@/components/ui/app-button";
import {
  reservationStatusBadgeStyles,
  reservationStatusLabel,
} from "@/components/reservation/reservation-ticket";

type DetailState =
  | { status: "loading" }
  | { status: "ready"; detail: CustomerDetail }
  | { status: "error"; message: string };

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <dt className="text-[12.5px] font-bold text-muted">{label}</dt>
      <dd className="text-[13.5px] text-foreground">{value}</dd>
    </div>
  );
}

export function AdminCustomerDetailView({ userId }: { userId: string }) {
  const [detailState, setDetailState] = useState<DetailState>({
    status: "loading",
  });
  const [notes, setNotes] = useState<CustomerNote[]>([]);
  const [reservations, setReservations] = useState<Reservation[] | null>(null);
  const [reservationError, setReservationError] = useState<string | null>(null);

  const [noteBody, setNoteBody] = useState("");
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

  // 마운트 직후 상세와 예약 이력을 자동 로드한다. effect body에서 곧바로 setState를
  // 호출하지 않도록 setTimeout(0)로 미뤄 cascading render 경고를 피한다
  // (admin-gyms-view와 동일 패턴).
  useEffect(() => {
    const controller = new AbortController();

    const timer = window.setTimeout(() => {
      void (async () => {
        setDetailState({ status: "loading" });
        try {
          const result = await fetchAdminCustomerDetail(
            userId,
            controller.signal,
          );
          if (controller.signal.aborted) return;
          if (result.ok) {
            setDetailState({ status: "ready", detail: result.detail });
            setNotes(result.notes);
          } else {
            setDetailState({ status: "error", message: result.message });
          }
        } catch {
          // AbortError 무시.
        }
      })();

      void (async () => {
        try {
          const result = await fetchAdminReservations(
            { userId, limit: 50 },
            controller.signal,
          );
          if (controller.signal.aborted) return;
          if (result.ok) {
            setReservations(result.reservations);
            setReservationError(null);
          } else {
            setReservationError(result.message);
          }
        } catch {
          // AbortError 무시.
        }
      })();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [userId]);

  const handleAddNote = useCallback(async () => {
    const validation = validateCustomerNoteBody(noteBody);
    if (!validation.ok) {
      setNoteError(validation.message);
      return;
    }

    setNoteSubmitting(true);
    setNoteError(null);
    const result = await createAdminCustomerNote(userId, validation.body);
    setNoteSubmitting(false);

    if (result.ok) {
      setNotes((prev) => [result.note, ...prev]);
      setNoteBody("");
    } else {
      setNoteError(result.message);
    }
  }, [noteBody, userId]);

  const handleDeleteNote = useCallback(
    async (noteId: string) => {
      setDeletingNoteId(noteId);
      const result = await deleteAdminCustomerNote(userId, noteId);
      setDeletingNoteId(null);

      if (result.ok) {
        setNotes((prev) => prev.filter((note) => note.id !== noteId));
      } else {
        setNoteError(result.message);
      }
    },
    [userId],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="break-all text-[13px] tabular-nums text-muted">
          UID {userId}
        </p>
        <ButtonLink href="/admin/customers" variant="outline" size="xs">
          목록으로
        </ButtonLink>
      </div>

      {detailState.status === "loading" ? (
        <AdminLoadingRow message="페이지를 불러오는 중입니다." />
      ) : null}

      {detailState.status === "error" ? (
        <AdminErrorNotice message={detailState.message} />
      ) : null}

      {detailState.status === "ready" ? (
        <DetailBody
          detail={detailState.detail}
          reservations={reservations}
          reservationError={reservationError}
          notes={notes}
          noteBody={noteBody}
          onNoteBodyChange={setNoteBody}
          noteSubmitting={noteSubmitting}
          noteError={noteError}
          onAddNote={handleAddNote}
          onDeleteNote={handleDeleteNote}
          deletingNoteId={deletingNoteId}
        />
      ) : null}
    </div>
  );
}

function DetailBody({
  detail,
  reservations,
  reservationError,
  notes,
  noteBody,
  onNoteBodyChange,
  noteSubmitting,
  noteError,
  onAddNote,
  onDeleteNote,
  deletingNoteId,
}: {
  detail: CustomerDetail;
  reservations: Reservation[] | null;
  reservationError: string | null;
  notes: CustomerNote[];
  noteBody: string;
  onNoteBodyChange: (value: string) => void;
  noteSubmitting: boolean;
  noteError: string | null;
  onAddNote: () => void;
  onDeleteNote: (noteId: string) => void;
  deletingNoteId: string | null;
}) {
  const { profile, firebase, firebaseError, reservations: summary } = detail;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {/* 프로필 */}
        <section className="rounded-xl border border-line bg-white p-4 sm:p-5">
          <h2 className="text-[15px] font-bold text-foreground">프로필</h2>
          {profile ? (
            <dl className="mt-3 divide-y divide-line">
              <InfoRow label="이름" value={profile.name ?? "(없음)"} />
              <InfoRow label="아이디" value={profile.loginId ?? "(없음)"} />
              <InfoRow label="로그인" value={providerLabel(profile.provider)} />
              <InfoRow
                label="가입일"
                value={formatAdminDate(profile.createdAt)}
              />
              <InfoRow
                label="선호 지역"
                value={profile.preferredRegion ?? "-"}
              />
              <InfoRow
                label="선호 종목"
                value={
                  profile.preferredSports.length > 0
                    ? profile.preferredSports.join(", ")
                    : "-"
                }
              />
              <InfoRow
                label="예약 알림"
                value={profile.reservationNotificationsEnabled ? "켜짐" : "꺼짐"}
              />
            </dl>
          ) : (
            <p className="mt-3 text-sm text-muted">
              앱 프로필이 없는 고객입니다(예약/Firebase 기록만 존재).
            </p>
          )}
        </section>

        {/* Firebase 계정 */}
        <section className="rounded-xl border border-line bg-white p-4 sm:p-5">
          <h2 className="text-[15px] font-bold text-foreground">계정 정보</h2>
          {firebaseError ? (
            <div className="mt-4">
              <AdminErrorNotice message="계정 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." />
            </div>
          ) : firebase ? (
            <dl className="mt-3 divide-y divide-line">
              <InfoRow label="이메일" value={firebase.email ?? "-"} />
              <InfoRow
                label="이메일 인증"
                value={firebase.emailVerified ? "완료" : "미인증"}
              />
              <InfoRow
                label="가입 시각"
                value={formatAdminDateTime(firebase.creationTime)}
              />
              <InfoRow
                label="최근 로그인"
                value={formatAdminDateTime(firebase.lastSignInTime)}
              />
              <InfoRow
                label="로그인 수단"
                value={
                  firebase.providers.length > 0
                    ? firebase.providers.join(", ")
                    : "-"
                }
              />
              <InfoRow
                label="계정 상태"
                value={firebase.disabled ? "비활성화됨" : "정상"}
              />
            </dl>
          ) : (
            <p className="mt-3 text-sm text-muted">
              Firebase 계정 정보가 없습니다.
            </p>
          )}
        </section>
      </div>

      {/* 지표 */}
      <section className="rounded-xl border border-line bg-white p-4 sm:p-5">
        <h2 className="text-[15px] font-bold text-foreground">예약 지표</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="전체 예약" value={`${summary.total}건`} />
          <MetricCard
            label={reservationStatusLabel.reserved}
            value={`${summary.reserved}건`}
          />
          <MetricCard
            label={reservationStatusLabel.used}
            value={`${summary.used}건`}
          />
          <MetricCard
            label={reservationStatusLabel.cancelled}
            value={`${summary.cancelled}건`}
          />
        </div>
        <p className="mt-4 text-[13px] tabular-nums text-muted">
          활성 즐겨찾기 {detail.activeFavoriteCount}개
        </p>
      </section>

      {/* 예약 이력 */}
      <section className="rounded-xl border border-line bg-white p-4 sm:p-5">
        <h2 className="mb-4 text-[15px] font-bold text-foreground">예약 이력</h2>
        {reservationError ? (
          <AdminErrorNotice message={reservationError} />
        ) : reservations === null ? (
          <AdminLoadingRow message="페이지를 불러오는 중입니다." />
        ) : reservations.length === 0 ? (
          <AdminEmptyState title="예약 이력이 없습니다" />
        ) : (
          <ul className="divide-y divide-line">
            {reservations.map((reservation) => (
              <li
                key={reservation.id}
                className="flex items-center justify-between gap-3 py-3.5"
              >
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold tabular-nums text-foreground">
                    {reservation.sport} · {reservation.date} {reservation.time}
                  </p>
                  <p className="truncate text-[13px] text-muted">
                    {reservation.gymId} · {formatGymPrice(reservation.price)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[12.5px] font-bold ${reservationStatusBadgeStyles[reservation.status]}`}
                >
                  {reservationStatusLabel[reservation.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 고객 메모 */}
      <section className="rounded-xl border border-line bg-white p-4 sm:p-5">
        <h2 className="text-[15px] font-bold text-foreground">고객 메모</h2>
        <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
          운영 참고용 메모입니다. 추가·삭제는 운영 이력에 기록됩니다.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          <textarea
            value={noteBody}
            onChange={(event) => onNoteBodyChange(event.target.value)}
            rows={3}
            maxLength={CUSTOMER_NOTE_MAX_LENGTH}
            placeholder="메모를 입력하세요"
            aria-label="고객 메모"
            className="w-full resize-y rounded-[10px] border border-line-strong bg-white px-3.5 py-3 text-[13.5px] leading-relaxed text-foreground transition placeholder:text-subtle focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] tabular-nums text-subtle">
              {noteBody.length}/{CUSTOMER_NOTE_MAX_LENGTH}
            </span>
            <Button
              onClick={onAddNote}
              disabled={noteSubmitting || noteBody.trim().length === 0}
            >
              {noteSubmitting ? (
                <>
                  <AdminButtonSpinner />
                  저장 중
                </>
              ) : (
                "메모 추가"
              )}
            </Button>
          </div>
          {noteError ? (
            <p className="text-[13px] font-semibold text-error" role="alert">
              {noteError}
            </p>
          ) : null}
        </div>

        <div className="mt-5">
          {notes.length === 0 ? (
            <AdminEmptyState title="등록된 메모가 없습니다" />
          ) : (
            <ul className="flex flex-col gap-2">
              {notes.map((note) => (
                <li
                  key={note.id}
                  className="rounded-xl border border-line bg-surface-2 px-4 py-3"
                >
                  <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-foreground">
                    {note.body}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-[13px] tabular-nums text-subtle">
                      {formatAdminDateTime(note.createdAt)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeleteNote(note.id)}
                      disabled={deletingNoteId === note.id}
                      className="text-[13px] font-semibold text-error transition hover:underline disabled:cursor-not-allowed disabled:text-subtle"
                    >
                      {deletingNoteId === note.id ? "삭제 중" : "삭제"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-5">
      <p className="text-[12.5px] font-bold text-muted">{label}</p>
      <p className="mt-2 text-[24px] font-bold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}
