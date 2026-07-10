"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

// 예약 일자 선택용 월간 캘린더 (PC). 시안(검진 예약 캘린더)을 예약에 맞춰 픽셀 재현한다.
// - 예약 가능 범위: 오늘 ~ maxDateValue(포함). 계산은 호출 측(예약 폼)이 SSOT로 담당하고
//   여기서는 받은 범위만 사용한다. 그 밖/과거/휴관일은 비활성.
// - 날짜만 고른다. 시간 선택과 실시간 잔여는 호출 측(예약 폼)의 시간 그리드가 담당한다.
// - 날짜 비교는 YYYY-MM-DD 문자열 사전식 비교로 타임존 영향 없이 처리한다.
// 스펙: 폭 752 / padding 16 / 타이틀 28px / 이전·다음 28×28 / 요일·일자 16px /
//       선택 셀 98×56 / 예약 가능 기간 박스 367×80 / 선택완료 92×44.

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toValue(year: number, month: number, day: number) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

// YYYY-MM-DD → YYYY.MM.DD (안내 박스 표기용).
function toDot(value: string) {
  return value.replaceAll("-", ".");
}

// 해당 월(month=1~12)의 달력 셀 배열. 앞쪽 빈칸은 null로 채워 일요일 시작 7열에 맞춘다.
function buildMonthCells(year: number, month: number): (number | null)[] {
  const startWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function ReservationCalendar({
  selectedDate,
  todayValue,
  maxDateValue,
  isDateDisabled,
  onSelect,
  closedDaysText,
}: {
  selectedDate: string | null;
  todayValue: string;
  // 예약 가능 마지막 날짜(YYYY-MM-DD, 포함). 산출은 호출 측이 담당한다(SSOT).
  maxDateValue: string;
  isDateDisabled?: (value: string) => boolean;
  onSelect: (value: string) => void;
  closedDaysText: string;
}) {
  const t = useTranslations("Reserve");
  const weekdays = t("calWeekdays").split(",");
  const [ty, tm] = todayValue.split("-").map(Number);
  const [maxYear, maxMonth] = maxDateValue.split("-").map(Number);
  const maxValue = maxDateValue;

  // 처음 보이는 달: 선택된 날짜가 있으면 그 달, 없으면 오늘 달.
  const [iy, im] = (selectedDate ?? todayValue).split("-").map(Number);
  const [view, setView] = useState({ year: iy, month: im });

  const cells = buildMonthCells(view.year, view.month);

  const atMinMonth = view.year < ty || (view.year === ty && view.month <= tm);
  const atMaxMonth =
    view.year > maxYear || (view.year === maxYear && view.month >= maxMonth);

  function goPrev() {
    if (atMinMonth) return;
    setView((v) =>
      v.month <= 1
        ? { year: v.year - 1, month: 12 }
        : { year: v.year, month: v.month - 1 },
    );
  }

  function goNext() {
    if (atMaxMonth) return;
    setView((v) =>
      v.month >= 12
        ? { year: v.year + 1, month: 1 }
        : { year: v.year, month: v.month + 1 },
    );
  }

  const navButtonClass =
    "grid size-7 place-items-center rounded-full border border-line text-foreground transition hover:bg-accent-tint disabled:cursor-not-allowed disabled:text-line-strong disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

  return (
    <div className="mx-auto w-full max-w-[752px] py-4">
      {/* 안내 박스 2개: 제목은 검정, 값은 네이비. 자체 좌우 패딩 없이 섹션 그리드에 맞춤. 사이 20px */}
      <div className="flex gap-5">
        <div className="flex-1 rounded-xl bg-slate-50 px-4 py-4 text-center">
          <p className="text-[14px] text-slate-900">{t("calRangeLabel")}</p>
          <p className="mt-1 text-[16px] font-bold text-accent-strong">
            {toDot(todayValue)} ~ {toDot(maxValue)}
          </p>
        </div>
        <div className="flex-1 rounded-xl bg-slate-50 px-4 py-4 text-center">
          <p className="text-[14px] text-slate-900">{t("calClosedLabel")}</p>
          <p className="mt-1 text-[16px] font-bold text-accent-strong">
            {closedDaysText}
          </p>
        </div>
      </div>

      {/* 월 네비게이션 — 타이틀 28px, 화살표 28×28 */}
      <div className="mt-6 flex items-center justify-center gap-6">
        <button
          type="button"
          onClick={goPrev}
          disabled={atMinMonth}
          aria-label={t("calPrevAria")}
          className={navButtonClass}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="text-[28px] font-bold text-slate-900">
          {view.year}.{pad2(view.month)}
        </span>
        <button
          type="button"
          onClick={goNext}
          disabled={atMaxMonth}
          aria-label={t("calNextAria")}
          className={navButtonClass}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      {/* 요일 헤더 16px */}
      <div className="mt-6 grid grid-cols-7 text-center text-[16px]">
        {weekdays.map((weekday, index) => (
          <span
            key={weekday}
            className={
              index === 0
                ? "text-error"
                : index === 6
                  ? "text-accent-strong"
                  : "text-muted"
            }
          >
            {weekday}
          </span>
        ))}
      </div>

      {/* 날짜 그리드 — 셀 높이 56, 선택 시 98×56 네이비 박스 */}
      <div className="mt-2 grid grid-cols-7">
        {cells.map((day, index) => {
          if (day === null) {
            return <div key={`pad-${index}`} className="h-14" />;
          }
          const value = toValue(view.year, view.month, day);
          const weekday = index % 7;
          const isPast = value < todayValue;
          const isAfterMax = value > maxValue;
          const isClosed = isDateDisabled?.(value) ?? false;
          const disabled = isPast || isAfterMax || isClosed;
          const isSelected = value === selectedDate;
          const isToday = value === todayValue;

          const numberClass = isSelected
            ? "text-white"
            : disabled
              ? "text-slate-300"
              : weekday === 0
                ? "text-error"
                : weekday === 6
                  ? "text-accent-strong"
                  : "text-slate-800";

          return (
            <button
              key={value}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              aria-label={`${t("calDayAria", {
                year: view.year,
                month: view.month,
                day,
              })}${isClosed ? ` ${t("calClosedDay")}` : ""}`}
              title={isClosed ? t("calClosedDay") : undefined}
              onClick={() => onSelect(value)}
              className={`relative mx-auto flex h-14 w-full max-w-[98px] items-center justify-center rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                isSelected
                  ? "bg-accent"
                  : disabled
                    ? "cursor-not-allowed"
                    : "hover:bg-accent-tint"
              }`}
            >
              {/* 숫자는 항상 셀 정중앙. '오늘'은 절대 위치라 중앙 정렬에 영향 없음 */}
              <span className={`text-[16px] ${numberClass}`}>{day}</span>
              {isToday ? (
                <span
                  className={`absolute bottom-1 text-[11px] font-semibold leading-none ${
                    isSelected ? "text-white" : "text-accent-strong"
                  }`}
                >
                  {t("calToday")}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* 예약불가 범례 */}
      <div className="mt-4 flex justify-end">
        <span className="flex items-center gap-1.5 text-[13px] text-slate-400">
          <span className="size-1.5 rounded-full bg-slate-300" />
          {t("calUnavailable")}
        </span>
      </div>
    </div>
  );
}
