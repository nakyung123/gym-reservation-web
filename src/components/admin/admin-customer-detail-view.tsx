"use client";

import Link from "next/link";
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
import {
  reservationStatusBadgeStyles,
  reservationStatusLabel,
} from "@/components/reservation-ticket";

type DetailState =
  | { status: "loading" }
  | { status: "ready"; detail: CustomerDetail }
  | { status: "error"; message: string };

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-800">{value}</dd>
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
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 lg:px-10">
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <Link
            href="/admin/customers"
            className="text-xs font-semibold text-accent-strong hover:underline"
          >
            ← 고객 관리
          </Link>
          <h1 className="text-2xl font-bold text-slate-950">고객 상세</h1>
          <p className="break-all text-xs text-slate-500">UID {userId}</p>
        </header>

        {detailState.status === "loading" ? (
          <AdminLoadingRow message="고객 상세를 불러오는 중입니다." />
        ) : null}

        {detailState.status === "error" ? (
          <p
            className="rounded-md border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error"
            role="alert"
          >
            {detailState.message}
          </p>
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
      </section>
    </main>
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
        <section className="rounded-lg border border-line bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-950">프로필</h2>
          {profile ? (
            <dl className="mt-3 divide-y divide-line">
              <InfoRow label="닉네임" value={profile.nickname ?? "(없음)"} />
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
            <p className="mt-3 text-sm text-slate-500">
              앱 프로필이 없는 고객입니다(예약/Firebase 기록만 존재).
            </p>
          )}
        </section>

        {/* Firebase 계정 */}
        <section className="rounded-lg border border-line bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-950">계정 정보</h2>
          {firebaseError ? (
            <p
              className="mt-3 rounded-md border border-error/30 bg-error/10 px-3 py-2 text-xs font-semibold text-error"
              role="alert"
            >
              계정 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
            </p>
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
            <p className="mt-3 text-sm text-slate-500">
              Firebase 계정 정보가 없습니다.
            </p>
          )}
        </section>
      </div>

      {/* 지표 */}
      <section className="rounded-lg border border-line bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-950">예약 지표</h2>
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
        <p className="mt-3 text-xs text-slate-500">
          활성 즐겨찾기 {detail.activeFavoriteCount}개
        </p>
      </section>

      {/* 예약 이력 */}
      <section className="rounded-lg border border-line bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-950">예약 이력</h2>
        {reservationError ? (
          <p
            className="mt-3 rounded-md border border-error/30 bg-error/10 px-3 py-2 text-xs font-semibold text-error"
            role="alert"
          >
            {reservationError}
          </p>
        ) : reservations === null ? (
          <AdminLoadingRow message="예약 이력을 불러오는 중입니다." />
        ) : reservations.length === 0 ? (
          <AdminEmptyState title="예약 이력이 없습니다" />
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {reservations.map((reservation) => (
              <li
                key={reservation.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {reservation.sport} · {reservation.date} {reservation.time}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {reservation.gymId} · {formatGymPrice(reservation.price)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${reservationStatusBadgeStyles[reservation.status]}`}
                >
                  {reservationStatusLabel[reservation.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 고객 메모 */}
      <section className="rounded-lg border border-line bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-950">고객 메모</h2>
        <p className="mt-1 text-xs text-slate-500">
          운영 참고용 메모입니다. 추가·삭제는 운영 이력에 기록됩니다.
        </p>

        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={noteBody}
            onChange={(event) => onNoteBodyChange(event.target.value)}
            rows={3}
            maxLength={CUSTOMER_NOTE_MAX_LENGTH}
            placeholder="메모를 입력하세요"
            className="w-full resize-y rounded-md border border-line-strong px-3 py-2 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-slate-400">
              {noteBody.length}/{CUSTOMER_NOTE_MAX_LENGTH}
            </span>
            <button
              type="button"
              onClick={onAddNote}
              disabled={noteSubmitting || noteBody.trim().length === 0}
              className="h-9 rounded-md bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              {noteSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <AdminButtonSpinner />
                  저장 중
                </span>
              ) : (
                "메모 추가"
              )}
            </button>
          </div>
          {noteError ? (
            <p className="text-xs font-semibold text-error" role="alert">
              {noteError}
            </p>
          ) : null}
        </div>

        {notes.length === 0 ? (
          <AdminEmptyState title="등록된 메모가 없습니다" />
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {notes.map((note) => (
              <li
                key={note.id}
                className="rounded-md border border-line bg-slate-50 px-3 py-2.5"
              >
                <p className="whitespace-pre-wrap break-words text-sm text-slate-800">
                  {note.body}
                </p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-400">
                    {formatAdminDateTime(note.createdAt)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDeleteNote(note.id)}
                    disabled={deletingNoteId === note.id}
                    className="text-xs font-semibold text-error transition hover:underline disabled:cursor-not-allowed disabled:text-slate-400"
                  >
                    {deletingNoteId === note.id ? "삭제 중" : "삭제"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-slate-50 p-4">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-bold text-slate-950">{value}</p>
    </div>
  );
}
