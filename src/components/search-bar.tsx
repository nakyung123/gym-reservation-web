"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 공용 검색바(공지·FAQ 공유). KMI 실측 톤: 알약형(높이 60), 얇은 테두리(2px), 우측 원형 버튼(40)+돋보기(24).
 *  - fields가 있으면 좌측에 커스텀 드롭다운(예: 전체/제목/내용)을 둔다. 선택값은 hidden input name="field".
 *  - hidden으로 폼에 함께 보낼 값(예: 활성 탭 cat)을 넘긴다.
 *  - 드롭다운 화살표는 사이트 표준 chevron(아래)로 통일한다(컴포넌트 재사용·일관성).
 * 제출은 JS 없이도 동작하는 GET 폼이며, 드롭다운 토글만 클라이언트에서 처리한다.
 */
export type SearchField = { value: string; label: string };

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function SearchBar({
  action,
  placeholder,
  searchLabel,
  fields,
  defaultField,
  defaultQuery = "",
  hidden = {},
  variant = "default",
}: {
  action: string;
  placeholder: string;
  searchLabel: string;
  fields?: SearchField[];
  defaultField?: string;
  defaultQuery?: string;
  hidden?: Record<string, string>;
  // board: 문의·FAQ·공지 게시판 규격(646×68, 검은 테두리·검은 돋보기 48, 드롭다운 간격 66).
  variant?: "default" | "board";
}) {
  const isBoard = variant === "board";
  const [open, setOpen] = useState(false);
  const [field, setField] = useState(
    defaultField ?? fields?.[0]?.value ?? "",
  );
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const current = fields?.find((item) => item.value === field) ?? fields?.[0];

  return (
    <form
      action={action}
      method="get"
      role="search"
      className={`mx-auto w-full ${isBoard ? "max-w-[646px]" : "max-w-[680px]"}`}
    >
      {Object.entries(hidden).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}

      <div
        className={`flex items-center rounded-full border-2 bg-white pl-6 pr-1.5 transition ${
          isBoard
            ? "h-[68px] border-black"
            : "h-[60px] border-foreground focus-within:border-accent"
        }`}
      >
        {fields ? (
          <div ref={wrapRef} className="relative flex h-full shrink-0 items-center">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-haspopup="listbox"
              aria-expanded={open}
              className={`flex items-center pr-4 text-[16px] font-medium text-foreground outline-none ${
                isBoard ? "gap-[111px]" : "gap-2"
              }`}
            >
              {current?.label}
              <ChevronDown
                className={`size-4 text-foreground transition-transform ${open ? "rotate-180" : ""}`}
              />
            </button>
            <input type="hidden" name="field" value={field} />
            {open ? (
              <ul
                role="listbox"
                className="absolute left-0 top-[calc(100%+8px)] z-20 w-[150px] overflow-hidden rounded-lg border border-line bg-white py-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
              >
                {fields.map((item) => (
                  <li key={item.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={item.value === field}
                      onClick={() => {
                        setField(item.value);
                        setOpen(false);
                      }}
                      className={`block w-full px-4 py-2.5 text-left text-[15px] transition hover:bg-surface-2 ${
                        item.value === field
                          ? "font-semibold text-accent-strong"
                          : "text-muted"
                      }`}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <input
          type="text"
          name="q"
          defaultValue={defaultQuery}
          placeholder={placeholder}
          className={`min-w-0 flex-1 bg-transparent text-[16px] text-slate-950 outline-none placeholder:text-subtle ${fields ? "ml-3" : ""}`}
        />

        <button
          type="submit"
          aria-label={searchLabel}
          className={`grid shrink-0 place-items-center rounded-full text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
            isBoard
              ? "size-12 bg-black hover:bg-black/85"
              : "size-10 bg-accent hover:bg-accent-hover"
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="size-6"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
        </button>
      </div>
    </form>
  );
}
