"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { getReservationEntryCode } from "@/lib/reservation-detail";
import { fetchUserProfile } from "@/lib/user-profile-client";
import type { Reservation } from "@/types/domain";

// 이용 시간은 슬롯 길이 데이터가 없어 시작+1시간으로 고정 표기한다(사용자 확정값).
const RESERVATION_DURATION_MS = 60 * 60 * 1000;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

// "2025-03-24 (월) 17:00" 형태로 표기.
function formatDateTime(date: Date) {
  const weekday = WEEKDAYS[date.getDay()];
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} (${weekday}) ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// 남은 시간(이용 시작까지)을 H:MM:SS로. 시작이 지났으면 0:00:00.
function formatCountdown(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${pad(minutes)}:${pad(seconds)}`;
}

type ReservationQrModalProps = {
  reservation: Reservation;
  gymName: string;
  onClose: () => void;
};

export function ReservationQrModal({
  reservation,
  gymName,
  onClose,
}: ReservationQrModalProps) {
  const [name, setName] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // 이용 시작 시각(로컬). reservation.time은 "HH:MM" 형식.
  const startDate = new Date(`${reservation.date}T${reservation.time}:00`);
  const startMs = startDate.getTime();
  const isValidStart = !Number.isNaN(startMs);
  const endDate = new Date(startMs + RESERVATION_DURATION_MS);

  // 이름은 회원정보에서 조회한다. 실패해도 팝업을 막지 않고 "—"로 둔다.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    fetchUserProfile(controller.signal)
      .then((result) => {
        if (cancelled) return;
        if (result.ok && result.profile?.name?.trim()) {
          setName(result.profile.name);
        }
      })
      .catch(() => {
        // 조회 실패는 무시(이름만 "—"로 표시). QR 자체는 영향 없음.
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  // 남은 시간 초단위 갱신.
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Esc로 닫기.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const entryCode = getReservationEntryCode(reservation);
  const remainingMs = startMs - nowMs;
  // 이용 시작 시각이 지나면(남은 시간 0) 만료된 코드로 본다(사용자 확정).
  const isExpired = isValidStart && remainingMs <= 0;
  const countdown = isValidStart ? formatCountdown(remainingMs) : "—";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="QR 체크인"
      onClick={onClose}
    >
      <div
        className="h-[849px] max-h-[90vh] w-full max-w-[454px] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[22px] font-bold text-slate-900">QR 체크인</h2>
            <p className="mt-1 text-[14px] text-slate-500">
              이용하려는 체육시설에 QR코드로 체크인하세요.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
              <path
                d="M5 5l10 10M15 5L5 15"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* QR 카드: 파란 헤더(시설명) + QR + 남은 시간 */}
        <div className="mt-5 overflow-hidden rounded-2xl border border-line shadow-sm">
          <div className="bg-accent px-4 py-3 text-center text-[16px] font-bold text-white">
            {gymName}
          </div>
          <div className="flex flex-col items-center gap-4 px-6 py-6">
            <QRCodeSVG
              value={entryCode}
              level="M"
              size={170}
              className={`h-auto w-full max-w-[170px] ${isExpired ? "opacity-30" : ""}`}
              role="img"
              aria-label="입장 QR 코드"
            />
            {isExpired ? (
              <p className="text-center text-[16px] font-semibold text-error">
                시간이 지나 만료된 코드입니다.
              </p>
            ) : (
              <div className="flex items-center gap-2 text-[16px] text-slate-500">
                <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
                  <circle
                    cx="10"
                    cy="10"
                    r="7.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M10 6v4l2.5 2"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>남은 시간</span>
                <span className="font-mono text-[16px] font-bold tabular-nums text-accent-strong">
                  {countdown}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 예약 정보 */}
        <dl className="mt-5">
          <div className="flex items-center justify-between border-b border-slate-100 py-3">
            <dt className="text-[16px] font-semibold text-slate-700">이름</dt>
            <dd className="text-[16px] text-slate-900">{name ?? "—"}</dd>
          </div>
          <div className="flex items-center justify-between border-b border-slate-100 py-3">
            <dt className="text-[16px] font-semibold text-slate-700">종목</dt>
            <dd className="text-[16px] text-slate-900">{reservation.sport}</dd>
          </div>
          <div className="flex items-center justify-between border-b border-slate-100 py-3">
            <dt className="text-[16px] font-semibold text-slate-700">
              시작시간
            </dt>
            <dd className="text-[16px] text-slate-900">
              {isValidStart ? formatDateTime(startDate) : "—"}
            </dd>
          </div>
          <div className="flex items-center justify-between py-3">
            <dt className="text-[16px] font-semibold text-slate-700">
              종료시간
            </dt>
            <dd className="text-[16px] text-slate-900">
              {isValidStart ? formatDateTime(endDate) : "—"}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
