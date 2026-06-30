"use client";

import { useState } from "react";

// 예약 일자 선택용 월간 캘린더 (PC). 시안의 '검진 일자' 캘린더를 우리 예약에 맞춰 재현한다.
// - 예약 가능 범위: 오늘 ~ monthsAhead개월 뒤(기본 2개월). 그 밖/과거/휴관일은 비활성.
// - 날짜만 고른다. 시간 선택과 실시간 잔여는 호출 측(예약 폼)의 시간 그리드가 담당한다.
// - 날짜 비교는 YYYY-MM-DD 문자열 사전식 비교로 타임존 영향 없이 처리한다.

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toValue(year: number, month: number, day: number) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
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
  monthsAhead = 2,
  isDateDisabled,
  onSelect,
}: {
  selectedDate: string | null;
  todayValue: string;
  monthsAhead?: number;
  isDateDisabled?: (value: string) => boolean;
  onSelect: (value: string) => void;
}) {
  const [ty, tm, td] = todayValue.split("-").map(Number);
  const maxObj = new Date(ty, tm - 1 + monthsAhead, td);
  const maxYear = maxObj.getFullYear();
  const maxMonth = maxObj.getMonth() + 1;
  const maxValue = toValue(maxYear, maxMonth, maxObj.getDate());

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
      v.month <= 1 ? { year: v.year - 1, month: 12 } : { year: v.year, month: v.month - 1 },
    );
  }

  function goNext() {
    if (atMaxMonth) return;
    setView((v) =>
      v.month >= 12 ? { year: v.year + 1, month: 1 } : { year: v.year, month: v.month + 1 },
    );
  }

  const navButtonClass =
    "grid size-9 place-items-center rounded-full text-[20px] text-foreground transition hover:bg-accent-tint disabled:cursor-not-allowed disabled:text-line-strong disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

  return (
    <div>
      {/* 예약 가능 기간 안내 */}
      <p className="text-center text-[13px] text-muted">
        예약 가능 기간{" "}
        <span className="font-semibold text-accent-strong">
          {todayValue} ~ {maxValue}
        </span>
      </p>

      {/* 월 네비게이션 */}
      <div className="mt-3 flex items-center justify-center gap-6">
        <button
          type="button"
          onClick={goPrev}
          disabled={atMinMonth}
          aria-label="이전 달"
          className={navButtonClass}
        >
          ‹
        </button>
        <span className="text-[20px] font-bold text-foreground">
          {view.year}.{pad2(view.month)}
        </span>
        <button
          type="button"
          onClick={goNext}
          disabled={atMaxMonth}
          aria-label="다음 달"
          className={navButtonClass}
        >
          ›
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="mt-5 grid grid-cols-7 text-center text-[13px] font-semibold">
        {WEEKDAYS.map((weekday, index) => (
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

      {/* 날짜 그리드 */}
      <div className="mt-2 grid grid-cols-7 justify-items-center gap-y-1">
        {cells.map((day, index) => {
          if (day === null) {
            return <span key={`pad-${index}`} className="size-10" />;
          }
          const value = toValue(view.year, view.month, day);
          const weekday = index % 7;
          const isPast = value < todayValue;
          const isAfterMax = value > maxValue;
          const isClosed = isDateDisabled?.(value) ?? false;
          const disabled = isPast || isAfterMax || isClosed;
          const isSelected = value === selectedDate;
          const isToday = value === todayValue;

          const dayClass = isSelected
            ? "bg-accent font-bold text-white"
            : disabled
              ? "cursor-not-allowed text-line-strong"
              : weekday === 0
                ? "text-error hover:bg-accent-tint"
                : weekday === 6
                  ? "text-accent-strong hover:bg-accent-tint"
                  : "text-foreground hover:bg-accent-tint";

          return (
            <div key={value} className="flex flex-col items-center">
              <button
                type="button"
                disabled={disabled}
                aria-pressed={isSelected}
                aria-label={`${view.year}년 ${view.month}월 ${day}일${
                  isClosed ? " 휴관일" : ""
                }`}
                title={isClosed ? "휴관일" : undefined}
                onClick={() => onSelect(value)}
                className={`grid size-10 place-items-center rounded-full text-[15px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${dayClass}`}
              >
                {day}
              </button>
              <span
                className={`text-[10px] font-semibold leading-none ${
                  isToday ? "text-accent-strong" : "text-transparent"
                }`}
              >
                오늘
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
