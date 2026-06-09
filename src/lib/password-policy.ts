// Firebase 프로젝트 비밀번호 정책의 클라이언트 미러.
//
// SSOT는 Firebase 콘솔의 비밀번호 정책이다
// (GET https://identitytoolkit.googleapis.com/v2/passwordPolicy 로 조회 가능).
// 현재 정책(enforcementState=ENFORCE): 최소 8자 + 영문 소문자 + 숫자 + 특수문자.
//
// 클라 검증은 즉시 인라인 안내를 위한 것이고, 최종 검증은 Firebase가 한다.
// 정책이 바뀌어 클라 미러와 어긋나도 firebase-email-auth / firebase-password-update의
// "auth/password-does-not-meet-requirements" 에러 매핑이 안전망(No Silent Fallback)이 된다.

export const PASSWORD_POLICY_HINT =
  "8자 이상, 영문 소문자·숫자·특수문자를 포함하세요.";

// 정책 위반 시 사유 메시지를, 충족 시 null을 반환한다.
// 빈 문자열은 "아직 입력 안 함"으로 보고 null을 돌려 인라인 에러를 띄우지 않는다.
export function validatePasswordPolicy(value: string): string | null {
  if (value.length === 0) return null;
  if (value.length < 8) return "비밀번호는 8자 이상이어야 합니다.";
  if (!/[a-z]/.test(value)) return "비밀번호에 영문 소문자를 포함해 주세요.";
  if (!/[0-9]/.test(value)) return "비밀번호에 숫자를 포함해 주세요.";
  if (!/[^A-Za-z0-9]/.test(value)) {
    return "비밀번호에 특수문자(!@#$ 등)를 포함해 주세요.";
  }
  return null;
}
