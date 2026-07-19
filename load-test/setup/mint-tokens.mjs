// k6 부하 테스트용 Firebase ID 토큰 발급/정리 스크립트.
//
// 사용:
//   npx dotenv -e .env.local -- node load-test/setup/mint-tokens.mjs mint
//   npx dotenv -e .env.local -- node load-test/setup/mint-tokens.mjs clean
//
// 주의: signInWithCustomToken은 Firebase Auth에 실제 사용자 레코드를 만든다.
// uid prefix를 고정(k6load-)해 두고 clean으로 반드시 회수한다. 비밀값은 출력하지 않는다.
// 발급된 tokens.json은 gitignore 대상이다(유효 1시간).

import { writeFileSync } from "node:fs";
import admin from "firebase-admin";

const UID_PREFIX = "k6load-";
const USER_COUNT = 200; // 슬롯 정원보다 훨씬 크게 잡아야 초과예약 방어를 검증할 수 있다.
// k6 스크립트가 load-test/tokens.json을 open()하므로 상위 디렉터리에 쓴다.
const OUT = new URL("../tokens.json", import.meta.url);

function initAdmin() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n",
  );
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "FIREBASE_ADMIN_* 환경변수가 없습니다. dotenv -e .env.local 로 실행하세요.",
    );
  }
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
  }
  return admin.auth();
}

// 커스텀 토큰 → ID 토큰 교환(Identity Toolkit REST). ID 토큰 유효기간 1시간.
async function exchange(customToken, apiKey) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`토큰 교환 실패 ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  return json.idToken;
}

async function mint() {
  const auth = initAdmin();
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY가 없습니다.");

  // 일반 사용자 N명 + 관리자 1명(custom claim admin=true).
  const specs = [
    ...Array.from({ length: USER_COUNT }, (_, i) => ({
      uid: `${UID_PREFIX}user-${i}`,
      claims: undefined,
    })),
    { uid: `${UID_PREFIX}admin`, claims: { admin: true } },
  ];

  const tokens = [];
  let done = 0;
  // 교환은 외부 API라 동시 30개로 제한(발급 단계에서 스로틀 맞고 싶지 않다).
  const CHUNK = 30;
  for (let i = 0; i < specs.length; i += CHUNK) {
    const slice = specs.slice(i, i + CHUNK);
    const got = await Promise.all(
      slice.map(async (spec) => {
        const custom = await auth.createCustomToken(spec.uid, spec.claims);
        const idToken = await exchange(custom, apiKey);
        return { uid: spec.uid, idToken, admin: spec.claims?.admin === true };
      }),
    );
    tokens.push(...got);
    done += got.length;
    process.stdout.write(`  발급 ${done}/${specs.length}\r`);
  }

  writeFileSync(
    OUT,
    JSON.stringify(
      {
        userTokens: tokens.filter((t) => !t.admin).map((t) => t.idToken),
        adminToken: tokens.find((t) => t.admin).idToken,
      },
      null,
      2,
    ),
  );
  console.log(`\n완료: 사용자 ${USER_COUNT}명 + 관리자 1명 토큰 저장`);
  console.log(`(토큰 값은 출력하지 않음. 파일: tokens.json, 유효 1시간)`);
}

async function clean() {
  const auth = initAdmin();
  const uids = [
    ...Array.from({ length: USER_COUNT }, (_, i) => `${UID_PREFIX}user-${i}`),
    `${UID_PREFIX}admin`,
  ];
  // deleteUsers는 1회 1000개까지.
  const result = await auth.deleteUsers(uids);
  console.log(
    `삭제 성공 ${result.successCount} / 실패 ${result.failureCount}` +
      ` (미존재 uid 실패는 정상)`,
  );
}

const mode = process.argv[2];
if (mode === "mint") await mint();
else if (mode === "clean") await clean();
else {
  console.error("사용법: node mint-tokens.mjs <mint|clean>");
  process.exitCode = 1;
}
