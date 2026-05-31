#!/usr/bin/env node
// 관리자 권한(custom claim admin=true)을 특정 Firebase 사용자에게 부여/회수하는 일회성 스크립트.
//
// /api/admin/* Route Handler는 Authorization: Bearer <Firebase ID token>을 검증하고
// decoded token의 custom claim admin === true 인 경우만 허용한다(src/lib/server/admin-auth.ts).
// 따라서 운영 관리자 계정에는 배포 전에 이 claim이 부여되어 있어야 한다.
//
// 사용법:
//   node scripts/grant-admin-claim.mjs <uid>            # admin=true 부여
//   node scripts/grant-admin-claim.mjs <uid> --revoke   # admin claim 회수
//
// 환경변수(둘 중 하나):
//   ㄱ. GOOGLE_APPLICATION_CREDENTIALS=<서비스계정 JSON 경로>  (또는 ADC)
//   ㄴ. FIREBASE_ADMIN_PROJECT_ID / FIREBASE_ADMIN_CLIENT_EMAIL / FIREBASE_ADMIN_PRIVATE_KEY
//
// 로컬에서 .env.local을 쓰려면:
//   dotenv -e .env.local -- node scripts/grant-admin-claim.mjs <uid>
// 운영 자격으로 한 번 돌릴 때는 PowerShell에서 $env로 임시 주입 후 실행한다.
//
// 정책:
// - 비밀값(서비스계정 키/토큰/이메일)은 절대 stdout/stderr/log에 출력하지 않는다.
//   화면에는 대상 uid와 결과 상태만 표시한다.
// - 부여 후 새 ID token에 claim이 반영되려면 클라이언트에서 getIdToken(true)로
//   강제 갱신하거나 재로그인해야 한다(아래 안내 출력).

import {
  cert,
  applicationDefault,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function parseArgs(argv) {
  const args = argv.slice(2);
  const revoke = args.includes("--revoke");
  const positional = args.filter((arg) => !arg.startsWith("--"));
  return { uid: positional[0], revoke };
}

function initAdminApp() {
  const existing = getApps();
  if (existing.length > 0) {
    return existing[0];
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  // 옵션 ㄴ: env에 3개 값 직접 주입한 경우.
  if (projectId && clientEmail && privateKey) {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        // .env에 \n으로 들어온 개행을 실제 개행으로 복원.
        privateKey: privateKey.replace(/\\n/g, "\n"),
      }),
    });
  }

  // 옵션 ㄱ: GOOGLE_APPLICATION_CREDENTIALS 경로 또는 ADC.
  return initializeApp({ credential: applicationDefault() });
}

async function main() {
  const { uid, revoke } = parseArgs(process.argv);

  if (!uid) {
    process.stderr.write(
      "사용법: node scripts/grant-admin-claim.mjs <uid> [--revoke]\n",
    );
    process.exit(1);
  }

  let auth;
  try {
    auth = getAuth(initAdminApp());
  } catch {
    // 초기화 실패 원인(자격 누락 등)만 알리고 비밀값은 출력하지 않는다.
    process.stderr.write(
      "[grant-admin-claim] Firebase Admin 초기화 실패: 자격 증명(GOOGLE_APPLICATION_CREDENTIALS 또는 FIREBASE_ADMIN_* )을 확인하세요.\n",
    );
    process.exit(1);
  }

  // 기존 custom claim을 읽어 admin 키만 갱신한다(다른 claim은 보존).
  let existingClaims;
  try {
    const user = await auth.getUser(uid);
    existingClaims = user.customClaims ?? {};
  } catch {
    process.stderr.write(
      `[grant-admin-claim] 사용자 조회 실패: uid=${uid} (존재하지 않거나 자격이 다른 프로젝트일 수 있습니다.)\n`,
    );
    process.exit(1);
  }

  const nextClaims = { ...existingClaims };
  if (revoke) {
    delete nextClaims.admin;
  } else {
    nextClaims.admin = true;
  }

  try {
    await auth.setCustomUserClaims(uid, nextClaims);
    if (revoke) {
      // admin claim 회수 후 기존 refresh token을 무효화한다.
      // 서버는 verifyIdToken(token, true)로 회수 여부를 확인하므로 기존 ID token도 차단된다.
      await auth.revokeRefreshTokens(uid);
    }
  } catch {
    process.stderr.write(
      `[grant-admin-claim] claim 설정 또는 토큰 회수 실패: uid=${uid}\n`,
    );
    process.exit(1);
  }

  if (revoke) {
    process.stdout.write(
      `[grant-admin-claim] uid=${uid} 의 admin claim을 회수했습니다.\n`,
    );
  } else {
    process.stdout.write(
      `[grant-admin-claim] uid=${uid} 에 admin=true claim을 부여했습니다.\n`,
    );
  }
  process.stdout.write(
    "반영하려면 해당 계정이 재로그인하거나 클라이언트에서 getIdToken(true)로 토큰을 강제 갱신해야 합니다.\n",
  );
  process.exit(0);
}

main();
