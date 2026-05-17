"use client";

import { useId, useState, type InputHTMLAttributes } from "react";

// 회원가입/로그인 폼용 재사용 입력 컴포넌트.
// 실시간 validation은 호출자가 props.error로 제어한다. 빈 문자열/null이면 정상 상태.
// 비밀번호 필드는 show/hide 토글 + clear ✕ 버튼 제공.

type CommonProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange"
> & {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  hint?: string | null;
};

export function TextField({
  label,
  value,
  onChange,
  error,
  hint,
  ...rest
}: CommonProps & { type?: "text" | "email" }) {
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
              ? "border-rose-400 focus:border-rose-500 focus:ring-rose-200"
              : "border-slate-300 focus:border-sky-500 focus:ring-sky-200"
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
            aria-label={`${label} 지우기`}
            className="absolute right-2 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full bg-slate-200 text-xs text-slate-700 transition hover:bg-slate-300"
          >
            ✕
          </button>
        ) : null}
      </div>
      {showError ? (
        <p id={errorId} className="text-xs font-semibold text-rose-700">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
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
              ? "border-rose-400 focus:border-rose-500 focus:ring-rose-200"
              : "border-slate-300 focus:border-sky-500 focus:ring-sky-200"
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
              aria-label={`${label} 지우기`}
              className="inline-flex size-6 items-center justify-center rounded-full bg-slate-200 text-xs text-slate-700 transition hover:bg-slate-300"
            >
              ✕
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "비밀번호 가리기" : "비밀번호 보기"}
            aria-pressed={visible}
            className="inline-flex h-6 items-center justify-center rounded-md border border-slate-300 bg-white px-2 text-[10px] font-semibold text-slate-700 transition hover:border-slate-400"
          >
            {visible ? "가림" : "보기"}
          </button>
        </div>
      </div>
      {showError ? (
        <p id={errorId} className="text-xs font-semibold text-rose-700">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}
