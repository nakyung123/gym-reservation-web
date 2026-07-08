#!/usr/bin/env node
// 로컬 dev 계정 초기화 스크립트(일회성). "실제 유저"의 계정·소유 데이터만 삭제한다:
//   - Firebase Auth 사용자 전체
//   - 로컬 DB user_profiles (앱 유저 레코드)
//   - favorites (유저 소유 데이터 — 유저가 없어지면 함께 삭제)
// 콘텐츠/데모 데이터는 보존한다: reservations(데모 예약), voc_posts(문의 게시판).
// 목적: 기존 테스트 계정을 지워 처음 회원가입 흐름을 깨끗하게 재검증하기 위함.
//
// 사용법:
//   dry-run(삭제 안 함, 대상만 표시):
//     dotenv -e .env.local -- node scripts/wipe-accounts.mjs
//   실제 삭제:
//     dotenv -e .env.local -- node scripts/wipe-accounts.mjs --confirm
//   실제 삭제 시에는 --project <projectId>가 대상 Firebase projectId와 일치해야 한다:
//     dotenv -e .env.local -- node scripts/wipe-accounts.mjs --confirm --project my-dev-project
//
// 안전장치(심층 방어):
//  1. DATABASE_URL이 localhost/127.0.0.1이 아니면 즉시 중단(운영 DB 보호).
//  2. --confirm 없이는 아무것도 지우지 않고 대상 건수만 출력한다.
//  3. Firebase는 DB처럼 로컬/운영을 URL로 구분할 수 없으므로, --confirm 시
//     --project <id>가 실제 projectId와 일치해야만 삭제를 진행한다(운영 계정 오삭제 방지).
//     projectId를 확인할 수 없으면(ADC 등) 삭제를 거부한다.
//
// 비밀값(서비스계정 키 등)은 출력하지 않는다. projectId는 공개 식별자라 표시한다.

import {
  cert,
  applicationDefault,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { PrismaClient } from "@prisma/client";

function initAdminApp() {
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, "\n"),
      }),
    });
  }
  return initializeApp({ credential: applicationDefault() });
}

async function listAllUids(auth) {
  const uids = [];
  let pageToken;
  do {
    const res = await auth.listUsers(1000, pageToken);
    res.users.forEach((u) => uids.push(u.uid));
    pageToken = res.pageToken;
  } while (pageToken);
  return uids;
}

async function deleteAllAuthUsers(auth, uids) {
  let deleted = 0;
  let failed = 0;
  for (let i = 0; i < uids.length; i += 1000) {
    const batch = uids.slice(i, i + 1000);
    const result = await auth.deleteUsers(batch);
    deleted += result.successCount;
    failed += result.failureCount;
  }
  return { deleted, failed };
}

// --project <id> 인자 값을 읽는다(--project=id / --project id 모두 지원). 없으면 null.
function parseProjectFlag(argv) {
  const eq = argv.find((arg) => arg.startsWith("--project="));
  if (eq) return eq.slice("--project=".length) || null;
  const idx = argv.indexOf("--project");
  if (idx !== -1 && argv[idx + 1] && !argv[idx + 1].startsWith("--")) {
    return argv[idx + 1];
  }
  return null;
}

async function main() {
  const confirm = process.argv.includes("--confirm");
  const projectFlag = parseProjectFlag(process.argv);
  const dbUrl = process.env.DATABASE_URL ?? "";
  const isLocalDb = dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1");

  // 안전장치 1: 로컬 DB가 아니면 중단.
  if (!isLocalDb) {
    process.stderr.write(
      "[wipe-accounts] 대상 DB가 로컬(localhost/127.0.0.1)이 아닙니다. 운영 데이터 보호를 위해 중단합니다.\n",
    );
    process.exit(1);
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID ?? null;

  // 안전장치 3: 실제 삭제(--confirm)는 --project가 대상 projectId와 일치해야 진행한다.
  // DB의 localhost 가드와 달리 Firebase는 URL로 dev/운영을 구분할 수 없어 명시적 지목을 요구한다.
  if (confirm) {
    if (!projectId) {
      process.stderr.write(
        "[wipe-accounts] FIREBASE_ADMIN_PROJECT_ID가 없어 대상 프로젝트를 확인할 수 없습니다.\n" +
          "ADC 자격 증명으로는 삭제를 진행하지 않습니다. FIREBASE_ADMIN_* env를 설정하세요.\n",
      );
      process.exit(1);
    }
    if (projectFlag !== projectId) {
      process.stderr.write(
        `[wipe-accounts] --project 값이 대상 projectId(${projectId})와 일치하지 않습니다.\n` +
          "운영 계정 오삭제 방지를 위해 중단합니다. 대상이 dev 프로젝트가 맞는지 확인한 뒤\n" +
          `  --confirm --project ${projectId}\n` +
          "로 다시 실행하세요.\n",
      );
      process.exit(1);
    }
  }

  process.stdout.write(
    `대상 Firebase projectId: ${projectId ?? "(GOOGLE_APPLICATION_CREDENTIALS/ADC)"}\n`,
  );
  process.stdout.write(`대상 로컬 DB: ${dbUrl.replace(/\/\/[^@]+@/, "//***:***@")}\n\n`);

  const prisma = new PrismaClient();
  let auth;
  try {
    auth = getAuth(initAdminApp());
  } catch {
    process.stderr.write(
      "[wipe-accounts] Firebase Admin 초기화 실패: 자격 증명(FIREBASE_ADMIN_* 또는 GOOGLE_APPLICATION_CREDENTIALS)을 확인하세요.\n",
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  // 대상 건수 집계.
  const uids = await listAllUids(auth);
  const [profiles, reservations, favorites, inquiries, vocPosts] =
    await Promise.all([
      prisma.userProfile.count(),
      prisma.reservation.count(),
      prisma.favorite.count(),
      prisma.inquiry.count(),
      prisma.vocPost.count(),
    ]);

  process.stdout.write("삭제 대상(실제 유저):\n");
  process.stdout.write(`  - Firebase Auth 사용자: ${uids.length}명\n`);
  process.stdout.write(`  - user_profiles: ${profiles}\n`);
  process.stdout.write(`  - favorites: ${favorites}\n\n`);
  process.stdout.write("보존(건드리지 않음):\n");
  process.stdout.write(`  - reservations(데모 예약): ${reservations}\n`);
  process.stdout.write(`  - voc_posts(문의 게시판): ${vocPosts} / inquiries: ${inquiries}\n\n`);

  if (!confirm) {
    process.stdout.write(
      "dry-run입니다. 실제로 지우려면 --confirm 플래그를 붙여 다시 실행하세요.\n" +
        "  dotenv -e .env.local -- node scripts/wipe-accounts.mjs --confirm\n",
    );
    await prisma.$disconnect();
    process.exit(0);
  }

  // 1) 유저 소유 데이터 삭제: favorites + user_profiles. 예약(데모)/VOC 게시판은 보존한다.
  //    (userId는 FK가 아니라 문자열이라, 삭제가 보존 콘텐츠 행을 깨지 않는다.)
  const [removedFavorites, removedProfiles] = await prisma.$transaction([
    prisma.favorite.deleteMany({}),
    prisma.userProfile.deleteMany({}),
  ]);
  process.stdout.write(
    `favorites 삭제: ${removedFavorites.count}건, user_profiles 삭제: ${removedProfiles.count}건.\n`,
  );

  // 2) Firebase Auth 사용자 삭제.
  if (uids.length > 0) {
    const { deleted, failed } = await deleteAllAuthUsers(auth, uids);
    process.stdout.write(
      `Firebase Auth 사용자 삭제: 성공 ${deleted}, 실패 ${failed}.\n`,
    );
  } else {
    process.stdout.write("Firebase Auth 사용자 없음.\n");
  }

  await prisma.$disconnect();
  process.stdout.write("\n계정 초기화 완료.\n");
  process.exit(0);
}

main().catch((error) => {
  console.error("[wipe-accounts] 예기치 못한 오류:", error?.message ?? error);
  process.exit(1);
});
