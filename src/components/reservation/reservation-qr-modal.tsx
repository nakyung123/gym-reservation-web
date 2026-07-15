"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { getReservationEntryCode } from "@/lib/reservation-detail";
import { fetchUserProfile } from "@/lib/user-profile-client";
import type { Reservation } from "@/types/domain";

// 이용 시간은 슬롯 길이 데이터가 없어 시작+1시간으로 고정 표기한다(사용자 확정값).
const RESERVATION_DURATION_MS = 60 * 60 * 1000;
// QR은 'QR 보기'를 누른 순간부터 이 초 동안만 노출되고, 다 되면 창이 자동으로 닫힌다.
// (예약 시간 전부터 미리 여는 대신, 입장 순간에만 잠깐 띄워 오남용을 줄인다.)
const ENTRY_WINDOW_SECONDS = 10;
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

type ReservationQrModalProps = {
  reservation: Reservation;
  gymName: string;
  // 예약 인원(price÷단가 역산). 역산 불가 시 null → "—"로 표기.
  people?: number | null;
  onClose: () => void;
};

export function ReservationQrModal({
  reservation,
  gymName,
  people = null,
  onClose,
}: ReservationQrModalProps) {
  const [name, setName] = useState<string | null>(null);
  // 입장 노출 카운트다운(10초 → 0). 0이 되면 창을 자동으로 닫는다.
  const [secondsLeft, setSecondsLeft] = useState(ENTRY_WINDOW_SECONDS);

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

  // 1초마다 카운트다운. 0에 도달하면 인터벌을 멈춘다(닫기는 아래 별도 effect).
  useEffect(() => {
    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // 카운트다운이 끝나면(0초) 창을 자동으로 닫는다. 다시 보려면 'QR 보기'를 재클릭.
  useEffect(() => {
    if (secondsLeft === 0) {
      onClose();
    }
  }, [secondsLeft, onClose]);

  // Esc로 닫기.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const entryCode = getReservationEntryCode(reservation);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-stretch justify-center bg-black/50 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="QR 체크인"
      onClick={onClose}
    >
      {/* 모바일: 화면을 꽉 채우고(rounded 없음) 세로 여백을 균등 분배(justify-evenly).
          데스크톱: 고정 폭 카드. */}
      <div
        className="flex h-full w-full flex-col overflow-y-auto bg-white p-[42px] shadow-xl sm:h-[860px] sm:max-h-[92vh] sm:max-w-[460px] sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[22px] font-bold text-slate-900">QR 체크인</h2>
            <p className="mt-1 text-[16px] text-slate-500">
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

        {/* 본문: QR 카드 + 예약 정보. 정보 리스트가 남는 세로 공간을 채워 하단 여백을
            상단 여백(패딩 42px)과 맞춘다. */}
        <div className="flex flex-1 flex-col pt-8">
          {/* QR 카드: 310×310 정사각형. 파란 헤더(시설명) + QR + 남은 시간. */}
          <div className="mx-auto flex h-[310px] w-[310px] max-w-full flex-col overflow-hidden rounded-2xl border border-line shadow-sm">
            <div className="bg-accent px-4 py-3 text-center text-[18px] font-bold text-white">
              {gymName}
            </div>
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4">
              <QRCodeSVG
                value={entryCode}
                level="M"
                size={185}
                className="h-auto w-full max-w-[185px]"
                role="img"
                aria-label="입장 QR 코드"
              />
              {/* 입장 안내 + 남은 노출 시간(초). 0초가 되면 창이 자동으로 닫힌다. */}
              <div
                className="flex items-center gap-2 text-[18px] text-slate-500"
                role="status"
                aria-live="polite"
              >
                <span className="font-semibold text-slate-700">입장해주세요</span>
                <span className="font-mono text-[18px] font-bold tabular-nums text-accent-strong">
                  {secondsLeft}초
                </span>
              </div>
            </div>
          </div>

          {/* 예약 정보: 남는 세로 공간을 채워(flex-1) 하단 여백을 상단(패딩 42px)과 맞춘다.
              rows를 균등 분배(justify-between)해 구분선·텍스트 간격 밸런스를 준다. */}
          <dl className="mt-8 flex w-full flex-1 flex-col justify-between">
            <div className="flex items-center justify-between border-b border-slate-100 py-3">
              <dt className="text-[18px] font-semibold text-slate-700">이름</dt>
              <dd className="text-[18px] text-slate-900">{name ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 py-3">
              <dt className="text-[18px] font-semibold text-slate-700">종목</dt>
              <dd className="text-[18px] text-slate-900">{reservation.sport}</dd>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 py-3">
              <dt className="text-[18px] font-semibold text-slate-700">인원</dt>
              <dd className="text-[18px] text-slate-900">
                {people != null ? `${people}명` : "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 py-3">
              <dt className="text-[18px] font-semibold text-slate-700">
                시작시간
              </dt>
              <dd className="text-[18px] text-slate-900">
                {isValidStart ? formatDateTime(startDate) : "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between py-3">
              <dt className="text-[18px] font-semibold text-slate-700">
                종료시간
              </dt>
              <dd className="text-[18px] text-slate-900">
                {isValidStart ? formatDateTime(endDate) : "—"}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
