import "server-only";

// UserProfile.provider는 서버가 ID token의 sign_in_provider와 uid prefix로 산출한다.
// 클라이언트는 provider 값을 보내지 않는다.
//
// 결정 규칙:
//   - uid가 "kakao:"로 시작하면 kakao
//   - uid가 "naver:"로 시작하면 naver
//   - signInProvider === "password" → local
//   - signInProvider === "google.com" → google
//   - 그 외(혹은 누락) → null. 호출자가 결정해서 처리. 조용히 잘못된 값을 채우지 않는다.

export type ProviderId = "local" | "google" | "kakao" | "naver";

export function resolveAuthProvider(input: {
  uid: string;
  signInProvider: string;
}): ProviderId | null {
  const { uid, signInProvider } = input;
  if (uid.startsWith("kakao:")) return "kakao";
  if (uid.startsWith("naver:")) return "naver";
  if (signInProvider === "password") return "local";
  if (signInProvider === "google.com") return "google";
  return null;
}
