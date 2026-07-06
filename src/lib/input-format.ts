// 입력값 자동 포맷 헬퍼. 숫자만 추출해 하이픈을 넣고 자릿수를 제한한다.
// 사용자가 지우거나 다시 입력해도 항상 같은 결과가 나오도록 순수 함수로 둔다.

// 휴대폰 번호: 010-1234-5678 형태. 숫자 최대 11자리.
export function formatPhone(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

// 생년월일: YYYY-MM-DD 형태. 숫자 최대 8자리.
export function formatBirthDate(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 8);
  if (d.length < 5) return d;
  if (d.length < 7) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
}
