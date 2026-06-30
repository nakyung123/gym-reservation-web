"use client";

import { useId, useMemo, useState } from "react";
import { SignupStepIndicator } from "@/components/signup-step-indicator";

// 회원가입 약관 동의 단계. 필수 항목에 모두 동의해야 다음 단계로 넘어간다.
// 약관 본문(body)은 법적 placeholder라 한국어 유지(데이터성). 선택 동의 항목은
// 동의 본문/저장 모델이 운영화 단계로 미루어져 있어 지금은 필수 항목만 노출한다.
type TermKey = "age" | "service";

type TermItem = {
  key: TermKey;
  tag: "필수" | "선택";
  label: string;
  required: boolean;
  body: string;
};

const TERMS: TermItem[] = [
  {
    key: "service",
    tag: "필수",
    label: "서울체육예약 이용약관",
    required: true,
    body:
      "본 약관은 서울체육예약 서비스(이하 '서비스') 이용에 관한 회원과 운영자 간의 권리, 의무 및 책임 사항을 규정합니다. " +
      "회원은 약관에 동의함으로써 서비스를 이용할 수 있으며, 예약 시 정해진 운영 정책과 환불 정책을 준수해야 합니다.",
  },
  {
    key: "age",
    tag: "필수",
    label: "만 14세 이상 가입 동의",
    required: true,
    body: "본 서비스는 만 14세 이상부터 이용할 수 있습니다. 만 14세 미만은 보호자 동의가 필요합니다.",
  },
];

type Checked = Record<TermKey, boolean>;

const INITIAL_CHECKED: Checked = {
  age: false,
  service: false,
};

export function SignupTermsStep({ onAgree }: { onAgree: () => void }) {
  const [checked, setChecked] = useState<Checked>(INITIAL_CHECKED);
  const [expanded, setExpanded] = useState<Set<TermKey>>(new Set());

  const allChecked = useMemo(() => TERMS.every((t) => checked[t.key]), [checked]);
  const requiredOk = useMemo(
    () => TERMS.every((t) => !t.required || checked[t.key]),
    [checked],
  );

  function toggle(key: TermKey) {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleAll() {
    const next = !allChecked;
    setChecked({ age: next, service: next });
  }

  function toggleExpanded(key: TermKey) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <div>
      <SignupStepIndicator current={1} />

      <hr className="mt-7 border-t border-[#e3e3e3]" />

      <h1 className="mt-8 text-[22px] font-bold text-[#252525]">
        서비스 이용 약관에 동의해주세요.
      </h1>

      {/* 모든 약관 동의 */}
      <button
        type="button"
        onClick={toggleAll}
        className="mt-5 flex items-center gap-3 text-[18px] font-medium text-[#252525]"
      >
        <CheckCircle checked={allChecked} size={26} />
        모든 약관에 동의합니다.
      </button>

      <hr className="mt-5 border-t border-[#e3e3e3]" />

      <h2 className="mt-6 text-[19px] font-bold text-[#252525]">
        회원 이용 약관
      </h2>

      <ul className="mt-4 flex flex-col gap-4">
        {TERMS.map((term) => (
          <TermRow
            key={term.key}
            term={term}
            checked={checked[term.key]}
            expanded={expanded.has(term.key)}
            onCheck={() => toggle(term.key)}
            onToggleBody={() => toggleExpanded(term.key)}
          />
        ))}
      </ul>

      <button
        type="button"
        onClick={onAgree}
        disabled={!requiredOk}
        className="mt-9 h-[56px] w-full rounded-[3px] bg-[#121212] text-[17px] font-medium text-white transition disabled:cursor-not-allowed disabled:bg-[#f1f1f1] disabled:text-[#9b9b9b]"
      >
        다음
      </button>
    </div>
  );
}

function TermRow({
  term,
  checked,
  expanded,
  onCheck,
  onToggleBody,
}: {
  term: TermItem;
  checked: boolean;
  expanded: boolean;
  onCheck: () => void;
  onToggleBody: () => void;
}) {
  const id = useId();
  return (
    <li>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onCheck}
          aria-pressed={checked}
          aria-labelledby={id}
          className="shrink-0"
        >
          <CheckCircle checked={checked} size={22} />
        </button>
        <span id={id} className="flex-1 text-[16px] text-[#252525]">
          [{term.tag}] {term.label}
        </span>
        <button
          type="button"
          onClick={onToggleBody}
          aria-expanded={expanded}
          className="flex shrink-0 items-center gap-0.5 text-[14px] text-[#9b9b9b]"
        >
          내용보기
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>
      {expanded ? (
        <p className="mt-2 whitespace-pre-line rounded-[3px] bg-[#f7f7f7] px-3 py-2 text-[13px] leading-relaxed text-[#555]">
          {term.body}
        </p>
      ) : null}
    </li>
  );
}

// 원형 체크. 동의 시 파란 원 + 흰 체크, 미동의 시 회색 원.
function CheckCircle({ checked, size }: { checked: boolean; size: number }) {
  return (
    <span
      className={`flex items-center justify-center rounded-full ${
        checked ? "bg-[#3b82f6] text-white" : "bg-[#e3e3e3] text-white"
      }`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12l5 5L20 7" />
      </svg>
    </span>
  );
}
