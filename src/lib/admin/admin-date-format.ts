/**
 * 관리자 화면 공용 날짜 포맷 헬퍼.
 *
 * 예약 관리(admin-reservations-view)와 슬롯 관리(admin-reservation-slots-form)가
 * 같은 pad/getTodayValue를 각자 정의하고 있어 한곳으로 통합한다.
 */

/** 2자리 zero-pad (예: 3 → "03"). */
export function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** 오늘 날짜를 YYYY-MM-DD(로컬 기준)로 반환한다. date input 기본값용. */
export function getTodayValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * ISO 문자열을 한국어 짧은 날짜·시간으로 표기한다.
 * 파싱 불가한 값은 원문을 그대로 돌려준다(빈 표시 방지).
 */
export function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}
