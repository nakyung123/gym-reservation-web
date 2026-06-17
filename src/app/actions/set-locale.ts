"use server";

import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";

// 언어 선택을 쿠키에 저장하는 Server Action. 미지원 값은 무시(검증 후 set).
// 클라이언트(LocaleSwitcher)에서 호출한 뒤 router.refresh()로 새 언어를 반영한다.
export async function setLocale(locale: string): Promise<void> {
  if (!isLocale(locale)) {
    return;
  }
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1년
    sameSite: "lax",
  });
}
