// i18n 공용 상수(클라/서버 공용 — cookies() 같은 서버 전용 API를 import하지 않는다).
// 지원 언어를 추가하려면 LOCALES와 messages/{locale}.json만 늘리면 된다.

export const LOCALES = ["ko", "en", "ja", "zh"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ko";

// 선택 언어를 저장하는 쿠키 이름(URL 라우팅 없이 쿠키로만 locale을 유지).
export const LOCALE_COOKIE = "locale";

// 드롭다운 목록에 표시할 라벨(각 언어 자기 이름).
export const LOCALE_LABELS: Record<Locale, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
  zh: "中文",
};

// 전환 버튼에 표시할 짧은 약자(locale 코드와 별개의 표시용 표기).
export const LOCALE_SHORT: Record<Locale, string> = {
  ko: "KR",
  en: "EN",
  ja: "JP",
  zh: "CH",
};

export function isLocale(value: string | undefined | null): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}
