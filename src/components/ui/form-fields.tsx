"use client";

import { useId, useState, type InputHTMLAttributes } from "react";
import { useTranslations } from "next-intl";

// 아이콘은 heroicons outline 스타일을 인라인으로 사용 (외부 의존 없음).
function EyeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.6}
      stroke="currentColor"
      className="size-4"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.6}
      stroke="currentColor"
      className="size-4"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.243 4.243L9.88 9.88"
      />
    </svg>
  );
}

// 입력값 지우기(clear) 버튼용 X 라인 아이콘. 이모지/글리프 대신 SVG 사용.
function ClearIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className="size-3"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

// 회원가입/로그인 폼용 재사용 입력 컴포넌트.
// 실시간 validation은 호출자가 props.error로 제어한다. 빈 문자열/null이면 정상 상태.
// 비밀번호 필드는 show/hide 토글 + clear <ClearIcon /> 버튼 제공.

type CommonProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange"
> & {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  hint?: string | null;
  hintTone?: "info" | "success";
};

function hintClassName(tone: "info" | "success" | undefined): string {
  if (tone === "success") return "text-xs font-semibold text-success";
  return "text-xs text-slate-500";
}

export function TextField({
  label,
  value,
  onChange,
  error,
  hint,
  hintTone,
  ...rest
}: CommonProps & { type?: "text" | "email" }) {
  const t = useTranslations("Auth");
  const id = useId();
  const errorId = `${id}-error`;
  const showError = Boolean(error);
  const showClear = value.length > 0 && !rest.disabled;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold text-slate-800">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={rest.type ?? "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={showError || undefined}
          aria-describedby={showError ? errorId : undefined}
          className={`h-10 w-full rounded-md border px-3 pr-9 text-sm focus:outline-none focus:ring-2 ${
            showError
              ? "border-error focus:border-error focus:ring-error/30"
              : "border-line-strong focus:border-accent focus:ring-accent/30"
          }`}
          {...rest}
        />
        {showClear ? (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onChange("");
            }}
            aria-label={t("fieldClear", { label })}
            className="absolute right-2 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full bg-slate-200 text-xs text-slate-700 transition hover:bg-slate-300"
          >
            <ClearIcon />
          </button>
        ) : null}
      </div>
      {showError ? (
        <p id={errorId} className="text-xs font-semibold text-error">
          {error}
        </p>
      ) : hint ? (
        <p className={hintClassName(hintTone)}>{hint}</p>
      ) : null}
    </div>
  );
}

export function PasswordField({
  label,
  value,
  onChange,
  error,
  hint,
  ...rest
}: CommonProps) {
  const t = useTranslations("Auth");
  const id = useId();
  const errorId = `${id}-error`;
  const [visible, setVisible] = useState(false);
  const showError = Boolean(error);
  const showClear = value.length > 0 && !rest.disabled;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold text-slate-800">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={showError || undefined}
          aria-describedby={showError ? errorId : undefined}
          className={`h-10 w-full rounded-md border px-3 pr-20 text-sm focus:outline-none focus:ring-2 ${
            showError
              ? "border-error focus:border-error focus:ring-error/30"
              : "border-line-strong focus:border-accent focus:ring-accent/30"
          }`}
          {...rest}
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {showClear ? (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange("");
              }}
              aria-label={t("fieldClear", { label })}
              className="inline-flex size-6 items-center justify-center rounded-full bg-slate-200 text-xs text-slate-700 transition hover:bg-slate-300"
            >
              <ClearIcon />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? t("passwordHide") : t("passwordShow")}
            aria-pressed={visible}
            className="inline-flex size-6 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            {visible ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
      </div>
      {showError ? (
        <p id={errorId} className="text-xs font-semibold text-error">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}
