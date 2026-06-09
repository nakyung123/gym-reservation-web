"use client";

import { useId, useMemo, useState } from "react";

// 회원가입 약관 동의 단계. 사용자가 필수 항목 2개에 동의해야 form 단계로 넘어간다.
// 약관 본문은 placeholder이며 실제 운영 시 운영자가 갱신한다.

// 선택 동의 항목(마케팅/광고)은 동의 본문/저장 모델이 운영화 단계로 미루어져 있어
// 지금은 노출하지 않는다. 필수 2개만 유지해 "동의 받는 척"을 줄인다.
type TermKey = "age" | "service";

type TermItem = {
  key: TermKey;
  label: string;
  required: boolean;
  body: string;
};

const TERMS: TermItem[] = [
  {
    key: "age",
    label: "만 14세 이상입니다.",
    required: true,
    body: "본 서비스는 만 14세 이상부터 이용할 수 있습니다. 만 14세 미만은 보호자 동의가 필요합니다.",
  },
  {
    key: "service",
    label: "서비스 이용 약관 동의",
    required: true,
    body:
      "본 약관은 공공체육관 예약 서비스(이하 '서비스') 이용에 관한 회원과 운영자 간의 권리, 의무 및 책임 사항을 규정합니다. " +
      "회원은 약관에 동의함으로써 서비스를 이용할 수 있으며, 예약 시 정해진 운영 정책과 환불 정책을 준수해야 합니다.",
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

  const allChecked = useMemo(
    () => TERMS.every((t) => checked[t.key]),
    [checked],
  );

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
    <section className="w-full rounded-lg border border-line bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold text-slate-950">서비스 이용 동의</h1>
      <p className="mt-1 text-sm text-slate-600">
        가입을 진행하기 위해 아래 약관에 동의해 주세요. 필수 항목 동의 후 다음으로 넘어갈 수 있습니다.
      </p>

      <div className="mt-5 rounded-md border border-line">
        <AgreeAllRow checked={allChecked} onChange={toggleAll} />
        <ul className="divide-y divide-line">
          {TERMS.map((t) => (
            <TermRow
              key={t.key}
              term={t}
              checked={checked[t.key]}
              expanded={expanded.has(t.key)}
              onCheck={() => toggle(t.key)}
              onToggleBody={() => toggleExpanded(t.key)}
            />
          ))}
        </ul>
      </div>

      <button
        type="button"
        onClick={onAgree}
        disabled={!requiredOk}
        className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        동의하고 계속하기
      </button>
    </section>
  );
}

function AgreeAllRow({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-3 border-b border-line bg-slate-50 px-4 py-3"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="size-4 cursor-pointer accent-accent"
      />
      <span className="text-sm font-semibold text-slate-900">
        약관 전체 동의하기
      </span>
    </label>
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
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={onCheck}
          className="size-4 cursor-pointer accent-accent"
        />
        <label htmlFor={id} className="flex-1 cursor-pointer text-sm text-slate-800">
          {term.label}{" "}
          <span
            className={
              term.required ? "text-error" : "text-slate-500"
            }
          >
            ({term.required ? "필수" : "선택"})
          </span>
        </label>
        <button
          type="button"
          onClick={onToggleBody}
          className="text-xs text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
          aria-expanded={expanded}
        >
          {expanded ? "접기" : "자세히"}
        </button>
      </div>
      {expanded ? (
        <p className="mt-2 whitespace-pre-line rounded-md bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
          {term.body}
        </p>
      ) : null}
    </li>
  );
}
