/**
 * 비동기 오류 판별·메시지 추출 SSOT.
 *
 * - fetch/useEffect 취소(AbortController)로 발생하는 AbortError는
 *   "사용자에게 보여줄 오류"가 아니므로 모든 화면·client helper에서
 *   동일한 기준으로 걸러낸다.
 * - 이 판별을 각 파일에서 재정의하지 않는다.
 *   (기존에 컴포넌트 4곳 + client helper 16곳에 복붙되어 있던 것을 통합)
 */

/** AbortController.abort()로 인한 취소 오류인지 판별한다. */
export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

/**
 * unknown 오류에서 사용자 표시용 메시지를 안전하게 뽑는다.
 * 메시지가 없으면 기본 문구를 반환한다(빈 알림 방지 · No Silent Fallback).
 */
export function getErrorMessage(
  error: unknown,
  fallback = "알 수 없는 오류가 발생했습니다.",
): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
