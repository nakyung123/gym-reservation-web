import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from "@/i18n/config";

// next-intl 기본 요청 설정. URL 라우팅 없이 locale 쿠키에서 언어를 읽는다.
// 쿠키가 없거나 미지원 값이면 DEFAULT_LOCALE(ko)로 폴백한다.
export default getRequestConfig(async () => {
  const store = await cookies();
  const cookieLocale = store.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
