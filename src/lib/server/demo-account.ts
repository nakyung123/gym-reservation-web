import "server-only";

// 공개 데모 계정 보호.
//
// README에 자격을 공개한 체험용 계정이 있으면, 방문자가 그 계정으로 탈퇴를 눌러
// 계정 자체를 없앨 수 있다. 되돌릴 방법이 없어 데모 링크가 그날로 죽는다.
// 그래서 이 계정에 한해 탈퇴를 서버에서 막는다(UI를 우회해도 통하지 않게).
//
// DEMO_USER_UID가 없으면 아무 동작도 바뀌지 않는다(로컬·테스트·일반 운영 영향 0).
//
// 한계: 비밀번호 변경은 클라이언트에서 Firebase SDK(updatePassword)로 직접 수행하므로
// 서버에서 막을 수 없다. 이건 scripts/reset-demo-account.mjs로 주기적으로 되돌린다.

export function isDemoUser(uid: string): boolean {
  const demoUid = process.env.DEMO_USER_UID?.trim();
  return demoUid !== undefined && demoUid.length > 0 && demoUid === uid;
}

export const DEMO_ACCOUNT_BLOCKED_MESSAGE =
  "체험용 데모 계정에서는 이 기능을 사용할 수 없습니다.";
