"use client";

import { useTranslations } from "next-intl";

/**
 * BoardPagination의 labels 객체를 한 곳에서 생성한다.
 *
 * 페이지네이션 5키는 Common 네임스페이스 하나로 통합했다(과거에는 Mypage/Gyms/Notice에
 * 동일 키가 중복 정의됐다). 화면 무관하게 같은 문구라 SSOT를 Common으로 둔다.
 */
export function useBoardPaginationLabels() {
  const t = useTranslations("Common");
  return {
    pagination: t("pagination"),
    firstPage: t("firstPage"),
    prevPage: t("prevPage"),
    nextPage: t("nextPage"),
    lastPage: t("lastPage"),
  };
}
