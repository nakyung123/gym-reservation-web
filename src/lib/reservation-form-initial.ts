import type { Gym, Sport } from "@/types/domain";

// 쿼리에서 받은 sport/date/time을 폼 초기 상태로 변환한다.
// - sport/time: gym에서 지원하지 않으면 무시하고 default(gym.sports[0]/availableTimes[0])를 사용한다.
// - date: 포맷만 검사한다. 7일 윈도우 검사는 dateOptions가 준비되는 시점에 isInitialDateInWindow로 한다.

const DATE_VALUE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type ReservationFormInitialQuery = {
  sport: string | null;
  date: string | null;
  time: string | null;
};

export type ReservationFormInitial = {
  initialSport: Sport;
  initialTime: string;
  initialSelectedDate: string | null;
};

export function resolveReservationFormInitial(
  gym: Pick<Gym, "sports" | "availableTimes">,
  query: ReservationFormInitialQuery,
): ReservationFormInitial {
  const { sport: querySport, date: queryDate, time: queryTime } = query;

  const initialSport: Sport = gym.sports.includes(querySport as Sport)
    ? (querySport as Sport)
    : gym.sports[0];

  const initialTime =
    queryTime && gym.availableTimes.includes(queryTime)
      ? queryTime
      : gym.availableTimes[0];

  const initialSelectedDate =
    queryDate && DATE_VALUE_PATTERN.test(queryDate) ? queryDate : null;

  return { initialSport, initialTime, initialSelectedDate };
}

// dateOptions(현재 시점 기준 7일 윈도우)에 query date가 포함되는지 확인한다.
// initialSelectedDate가 null이면 query로 들어온 date가 없거나 형식이 잘못된 경우라
// 추가 검증 대상이 아니므로 true로 간주한다.
export function isInitialDateInWindow(
  initialSelectedDate: string | null,
  dateValues: readonly string[],
): boolean {
  if (initialSelectedDate === null) {
    return true;
  }
  return dateValues.includes(initialSelectedDate);
}
