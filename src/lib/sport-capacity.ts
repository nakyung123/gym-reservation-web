import { getGymSportPrice } from "@/lib/gym-utils";
import type { Gym, Sport } from "@/types/domain";

// 종목별 적정 이용 인원(정원). 인원 선택 상한이자 합산 청구가의 기준.
// SSOT: 프론트(폼 표시·전송)·서버(저장가 재계산)·검증이 모두 이 한 곳을 참조한다.
// server-only 아님 — 클라이언트(reservation-form)와 서버(db-reservation-repository) 양쪽에서 import한다.
export const SPORT_MAX_PEOPLE: Record<Sport, number> = {
  배드민턴: 4,
  탁구: 4,
  농구: 10,
  풋살: 10,
  배구: 12,
};

// people을 [1, 정원] 범위로 보정한다. 미전송(undefined)은 1로 취급(하위호환).
// NaN/Infinity(예: URL 조작으로 Number("abc")) 같은 비유한값도 1로 폴백한다.
export function clampPeople(sport: Sport, people: number | undefined): number {
  const max = SPORT_MAX_PEOPLE[sport] ?? 1;
  const n = Number.isFinite(people) ? Math.trunc(people as number) : 1;
  return Math.min(Math.max(n, 1), max);
}

// people 유효성. 범위 밖·비정수는 false. 서버 reject·클라 UX에서 공통 사용.
// 미전송(undefined)은 1 취급이라 true.
export function isValidPeople(
  sport: Sport,
  people: number | undefined,
): boolean {
  if (people == null) {
    return true;
  }
  return (
    Number.isInteger(people) &&
    people >= 1 &&
    people <= (SPORT_MAX_PEOPLE[sport] ?? 1)
  );
}

// 합산 청구가 = 단가 × clamp(인원). 저장가·표시가의 단일 계산 경로.
export function computeReservationPrice(
  gym: Gym,
  sport: Sport,
  people: number | undefined,
): number {
  return getGymSportPrice(gym, sport) * clampPeople(sport, people);
}
