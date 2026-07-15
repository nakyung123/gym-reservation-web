import { getGymSportPrice } from "@/lib/gym-utils";
import type { Gym, Reservation } from "@/types/domain";

/**
 * 마이페이지 공용 순수 로직 모음.
 * 화면(패널) 컴포넌트에서 UI와 무관한 계산을 분리해 단위 검증이 가능하게 한다.
 */

/** 마이페이지 탭 식별자. URL ?tab= 값과 1:1 대응한다. */
export type MypageTab = "reservations" | "favorites" | "inquiries" | "info";

/** 탭 정의(순서=화면 노출 순서). labelKey는 Mypage 네임스페이스 번역 키. */
export const TABS: { key: MypageTab; href: string; labelKey: string }[] = [
  { key: "reservations", href: "/mypage", labelKey: "tabReservations" },
  { key: "favorites", href: "/mypage?tab=favorites", labelKey: "tabFavorites" },
  { key: "inquiries", href: "/mypage?tab=inquiries", labelKey: "tabInquiries" },
  { key: "info", href: "/mypage?tab=info", labelKey: "tabAccount" },
];

/** ?tab= 파싱. 알 수 없는 값은 기본 탭(예약내역)으로 안전하게 수렴한다. */
export function parseTab(value: string | null): MypageTab {
  if (value === "favorites" || value === "inquiries" || value === "info") {
    return value;
  }
  return "reservations";
}

/** ?*Page= 파싱. 숫자가 아니거나 1 미만이면 1페이지. */
export function parsePage(value: string | null): number {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
}

/**
 * 예약 인원 역산.
 * Reservation에는 인원 컬럼이 없고 price를 단가×인원 합산가로 저장하므로,
 * price ÷ 종목 단가가 양의 정수로 딱 떨어질 때만 인원으로 신뢰한다.
 * 시설 미확인·단가 변경 등으로 나눠떨어지지 않으면 null을 반환해
 * QR 화면에서 "—"로 표기한다(잘못된 값 노출 방지).
 */
export function derivePeople(
  gym: Gym | undefined,
  reservation: Reservation,
): number | null {
  if (!gym) return null;
  const unit = getGymSportPrice(gym, reservation.sport);
  if (!Number.isFinite(unit) || unit <= 0) return null;
  const people = reservation.price / unit;
  return Number.isInteger(people) && people > 0 ? people : null;
}
