"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { setLocale } from "@/app/actions/set-locale";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/i18n/config";

// 언어 전환 드롭다운. 쿠키 기반이라 선택 시 setLocale(쿠키 저장) 후 router.refresh로
// 서버 컴포넌트를 새 언어로 다시 렌더한다. a11y: aria-expanded/haspopup, ESC·외부클릭 닫기.
export function LocaleSwitcher() {
  const t = useTranslations("Nav");
  const current = useLocale() as Locale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function change(next: Locale) {
    setOpen(false);
    if (next === current) {
      return;
    }
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={pending}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("language")}
        className="inline-flex items-center gap-1 rounded text-[14.5px] font-semibold text-muted transition hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {current.toUpperCase()}
        <span aria-hidden="true" className="text-[11px]">
          ▾
        </span>
      </button>
      {open ? (
        <ul
          role="menu"
          className="absolute right-0 top-full z-20 mt-2 min-w-[120px] overflow-hidden rounded-lg border border-line bg-white py-1 shadow-[0_4px_16px_rgba(15,23,42,0.12)]"
        >
          {LOCALES.map((locale) => (
            <li key={locale} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={locale === current}
                onClick={() => change(locale)}
                className={`flex w-full items-center justify-between px-3.5 py-2 text-left text-[14.5px] transition hover:bg-surface-2 focus-visible:outline-none focus-visible:bg-surface-2 ${
                  locale === current
                    ? "font-bold text-accent-strong"
                    : "text-foreground"
                }`}
              >
                {LOCALE_LABELS[locale]}
                {locale === current ? (
                  <span aria-hidden="true" className="text-accent-strong">
                    ✓
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
