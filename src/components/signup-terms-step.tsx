"use client";

import { useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

// 회원가입 약관 동의 단계. 사용자가 필수 항목 2개에 동의해야 form 단계로 넘어간다.
// 라벨/UI는 i18n(Auth 네임스페이스), 약관 본문(body)은 법적 placeholder라 한국어 유지(데이터성).
//
// 선택 동의 항목(마케팅/광고)은 동의 본문/저장 모델이 운영화 단계로 미루어져 있어
// 지금은 노출하지 않는다. 필수 2개만 유지해 "동의 받는 척"을 줄인다.
type TermKey = "age" | "service";

type TermItem = {
  key: TermKey;
  labelKey: string;
  required: boolean;
  body: string;
};

const TERMS: TermItem[] = [
  {
    key: "age",
    labelKey: "termsAge",
    required: true,
    body: "본 서비스는 만 14세 이상부터 이용할 수 있습니다. 만 14세 미만은 보호자 동의가 필요합니다.",
  },
  {
    key: "service",
    labelKey: "termsService",
    required: true,
    body:
      "본 약관은 서울체육예약 서비스(이하 '서비스') 이용에 관한 회원과 운영자 간의 권리, 의무 및 책임 사항을 규정합니다. " +
      "회원은 약관에 동의함으로써 서비스를 이용할 수 있으며, 예약 시 정해진 운영 정책과 환불 정책을 준수해야 합니다.",
  },
];

type Checked = Record<TermKey, boolean>;

const INITIAL_CHECKED: Checked = {
  age: false,
  service: false,
};

export function SignupTermsStep({ onAgree }: { onAgree: () => void }) {
  const t = useTranslations("Auth");
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
      <h1 className="text-xl font-bold text-slate-950">{t("termsTitle")}</h1>
      <p className="mt-1 text-sm text-slate-600">{t("termsIntro")}</p>

      <div className="mt-5 rounded-md border border-line">
        <AgreeAllRow checked={allChecked} onChange={toggleAll} />
        <ul className="divide-y divide-line">
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
      </div>

      <button
        type="button"
        onClick={onAgree}
        disabled={!requiredOk}
        className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {t("termsContinue")}
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
  const t = useTranslations("Auth");
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
        {t("termsAgreeAll")}
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
  const t = useTranslations("Auth");
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
          {t(term.labelKey)}{" "}
          <span
            className={
              term.required ? "text-error" : "text-slate-500"
            }
          >
            ({term.required ? t("termsRequired") : t("termsOptional")})
          </span>
        </label>
        <button
          type="button"
          onClick={onToggleBody}
          className="text-xs text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
          aria-expanded={expanded}
        >
          {expanded ? t("termsCollapse") : t("termsMore")}
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
