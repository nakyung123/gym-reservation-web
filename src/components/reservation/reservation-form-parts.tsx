"use client";

import { useState, type ReactNode } from "react";
import type { ReservationTimeState } from "@/lib/reservation-rules";

/**
 * 예약 폼(reservation-form.tsx)의 프레젠테이션 소품·상수 모음.
 *
 * 예약 위저드 본체(상태·제출 로직)와 "그리기만 하는" 조각을 분리해
 * 본체 파일을 읽을 때 단계 흐름만 따라갈 수 있게 한다.
 * 여기 있는 컴포넌트는 상태를 갖지 않거나(열림 토글 정도) 콜백만 받는다.
 */

// ── 상수 ──────────────────────────────────────────────────────────────

// 약관 동의 항목(모두 필수). 가입 단계에서 이미 동의받지만, 예약 시점 재확인용.
// content: 펼쳤을 때 노출되는 약관 본문(문단 배열).
export const REQUIRED_TERMS = [
  {
    id: "privacy",
    label: "[필수] 예약 정보 및 개인정보 수집·이용 동의",
    content: [
      "(주)서울체육예약은 「개인정보 보호법」에 따라 체육시설 예약 서비스 제공을 위해 아래와 같이 개인정보를 수집·이용합니다.",
      "1. 수집·이용 목적: 시설 예약 접수 및 관리, 예약 확인·취소, 현장 입장 시 본인 확인",
      "2. 수집 항목: 이름, 연락처, 생년월일, 예약 내역",
      "3. 보유·이용 기간: 예약 종료 후 관계 법령이 정한 기간 동안 보관한 뒤 파기",
      "4. 동의를 거부할 권리가 있으나, 거부 시 예약 서비스 이용이 제한될 수 있습니다.",
    ],
  },
  {
    id: "rules",
    label: "[필수] 시설 이용 규정 및 취소·환불 정책 동의",
    content: [
      "예약하신 시간과 용도 범위 안에서만 시설을 이용해야 하며, 시설·비품을 훼손한 경우 원상 복구 또는 그에 따른 비용이 부과될 수 있습니다.",
      "취소·환불 기준은 각 시설의 운영 정책을 따릅니다. 예약 전 2시간까지 마이페이지 예약 내역에서 취소할 수 있으며, 이후에는 취소가 제한될 수 있습니다.",
      "예약은 예약자 본인만 이용할 수 있으며 타인에게 양도·재판매할 수 없습니다. 현장에서 예약자 본인 확인을 요청할 수 있습니다.",
    ],
  },
] as const;

export type TermId = (typeof REQUIRED_TERMS)[number]["id"];

// 예약 불가 사유 → 번역 키 매핑. 라벨 텍스트는 messages의 Reserve.* 를 따른다.
export const unavailableTimeLabelKeys = {
  "gym-mismatch": "unavailGymMismatch",
  "sport-unavailable": "unavailSportUnavailable",
  "time-unavailable": "unavailTimeUnavailable",
  "invalid-date-time": "unavailInvalidDateTime",
  "past-time": "unavailPastTime",
  "closed-day": "unavailClosedDay",
  "duplicate-active-reservation": "unavailDuplicate",
} as const;

// 결제 수단(포트폴리오용 목업 — 실제 PG 연동 없음). 하나를 골라야 예약 신청이 활성화된다.
export const PAYMENT_METHODS = [
  { id: "card", label: "카드결제" },
  { id: "easy-pay", label: "간편결제" },
  { id: "virtual-account", label: "가상계좌(무통장 입금)" },
] as const;

// ── 순수 헬퍼 ─────────────────────────────────────────────────────────

/** 2자리 zero-pad (예: 3 → "03"). 날짜 문자열 조립용. */
export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** 시간 버튼의 상태별 클래스. 예약 가능/선택됨/중복 예약/불가를 색으로 구분한다. */
export function getTimeButtonClass(
  timeState: ReservationTimeState,
  isSelected: boolean,
) {
  if (timeState.available) {
    return isSelected
      ? "border-accent bg-accent text-accent-ink"
      : "border-line-strong text-foreground hover:border-accent hover:text-accent-strong";
  }

  if (timeState.reason === "duplicate-active-reservation") {
    return "cursor-not-allowed border-accent/30 bg-accent-tint text-accent-strong";
  }

  return "cursor-not-allowed border-line bg-surface-2 text-subtle";
}

// ── 프레젠테이션 컴포넌트 ─────────────────────────────────────────────

/** 라벨(좌, 검정) + 값(우, 네이비 볼드) 한 줄. 예약 상세 페이지와 동일 포맷. */
export function Row({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-4 py-2.5">
      {/* 라벨(예약자명·생년월일·연락처)은 검정, 실제 값은 네이비 */}
      <dt className="text-[16px] text-slate-900">{label}</dt>
      <dd className="text-[16px] font-bold text-accent-strong">{children}</dd>
    </div>
  );
}

/** 우측 sticky 요약 패널의 한 줄 (라벨 좌 · 값 우). 패널 폭(378px)에 맞춘 compact row. */
export function SummaryLine({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-[14px] text-slate-900">{label}</dt>
      <dd className="text-right text-[14px] font-medium text-slate-900">
        {value}
      </dd>
    </div>
  );
}

/**
 * 원형 체크 표시(프레젠테이션). 활성 시 네이비+흰 체크, 비활성 시 회색.
 * 약관 동의 버튼과 종목 선택 리스트가 공유한다.
 */
export function CheckDot({ active }: { active: boolean }) {
  return (
    <span
      className={`grid size-6 shrink-0 place-items-center rounded-full transition ${
        active ? "bg-accent text-white" : "bg-slate-200 text-slate-400"
      }`}
    >
      <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
        <path
          d="M4 8.5l2.5 2.5L12 5.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/** 접힌 섹션 요약 한 줄(라벨 좌 · 값 우, 네이비 강조). */
export function SummaryPeek({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between text-[16px] text-slate-900">
      <span>{label}</span>
      {/* 값(금액·날짜시간·명수)은 네이비 볼드 강조, 라벨은 검정 */}
      <span className="font-bold text-accent-strong">{value}</span>
    </div>
  );
}

/**
 * 단계 확정 버튼: 우측 선택완료. 누르면 현재 섹션을 접고 다음 섹션을 편다.
 * divider: none=구분선 없음 / full=박스 끝까지 늘린 구분선(카드 px-8 상쇄).
 */
export function StepConfirm({
  onClick,
  divider = "none",
  error = false,
  label = "선택완료",
}: {
  onClick: () => void;
  divider?: "none" | "full";
  // 미확정 상태로 다음 단계를 시도했을 때 빨간 강조로 바꾼다.
  error?: boolean;
  label?: string;
}) {
  const dividerClass =
    divider === "full" ? "-mx-8 border-t border-slate-200 px-8 pt-6" : "";
  const buttonClass = error
    ? "border-error text-error hover:bg-error/5"
    : "border-accent text-accent-strong hover:bg-accent-tint";
  return (
    <div className={`mt-6 flex justify-end ${dividerClass}`}>
      <button
        type="button"
        onClick={onClick}
        className={`h-11 min-w-[92px] rounded-lg border px-4 text-[14px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${buttonClass}`}
      >
        {label}
      </button>
    </div>
  );
}

/** 약관 동의 원형 체크 버튼(클릭 토글). */
export function CircleCheck({
  checked,
  onClick,
  label,
  className,
}: {
  checked: boolean;
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      aria-label={label}
      className={`shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
        className ?? ""
      }`}
    >
      <CheckDot active={checked} />
    </button>
  );
}

/** 약관 1건: 좌측 원형 체크(동의 토글) + 라벨 + 우측 펼침 토글. 펼치면 약관 본문이 나온다. */
export function TermItem({
  label,
  content,
  checked,
  onToggle,
}: {
  label: string;
  content: readonly string[];
  checked: boolean;
  onToggle: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* 약관 항목 박스(체크 + 라벨 + 펼침 토글). 박스 padding 16px, 체크원은 그 안에서 왼쪽 20px 띄움 */}
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3.5">
        <CircleCheck
          checked={checked}
          onClick={onToggle}
          label={`${label} 동의`}
          className="ml-5"
        />
        <span className="flex-1 text-[14px] text-slate-800">{label}</span>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label="약관 내용 펼치기"
          className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {/* CollapsibleSection과 동일한 ^ 아이콘·회전 규칙 */}
          <svg
            viewBox="0 0 16 16"
            className={`h-4 w-4 text-slate-400 transition-transform ${
              open ? "" : "rotate-180"
            }`}
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
        </button>
      </div>
      {open ? (
        // 펼침 내용은 항목 박스와 분리된 별도 회색 박스.
        <div className="mt-2 max-h-56 overflow-y-auto rounded-lg bg-slate-50 p-4 text-[14px] leading-relaxed text-slate-600">
          {content.map((paragraph, index) => (
            <p key={paragraph} className={index === 0 ? "" : "mt-2"}>
              {paragraph}
            </p>
          ))}
        </div>
      ) : null}
    </>
  );
}
