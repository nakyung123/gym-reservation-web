// 관리자 화면용 날짜/시각 포맷 SSOT. ISO 문자열을 로컬 표시 형식으로 바꾼다.
// 값이 없거나 파싱 불가면 "-"를 돌려준다(빈 칸이 무엇인지 분명하게).

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatAdminDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

export function formatAdminDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
