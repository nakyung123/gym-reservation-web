"use client";

import { useTranslations } from "next-intl";

/** 페이지네이션 라벨 키를 보유한 네임스페이스(현재 3곳에 동일 키가 존재). */
type PaginationNamespace = "Mypage" | "Gyms" | "Notice";

/**
 * BoardPagination의 labels 객체를 한 곳에서 생성한다.
 *
 * 기존에는 화면마다 5개 키 번역 객체를 통째로 복붙했다(mypage 패널들,
 * gym-discovery, notice). 키 자체는 아직 네임스페이스별로 중복 정의되어 있어
 * 호출부의 네임스페이스를 그대로 받는다.
 * (Common 네임스페이스로의 키 통합은 ko/en parity 검증이 필요해 별도 작업으로 둔다)
 */
export function useBoardPaginationLabels(
  namespace: PaginationNamespace = "Mypage",
) {
  const t = useTranslations(namespace);
  return {
    pagination: t("pagination"),
    firstPage: t("firstPage"),
    prevPage: t("prevPage"),
    nextPage: t("nextPage"),
    lastPage: t("lastPage"),
  };
}
