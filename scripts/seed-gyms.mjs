import { readFile } from "node:fs/promises";
import process from "node:process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const sports = new Set(["배드민턴", "농구", "풋살", "탁구", "배구"]);
const seedDataPath = new URL("../src/data/gyms.json", import.meta.url);

function parseArgs(argv) {
  const args = {
    dryRun: false,
    help: false,
    prune: false,
    projectId: undefined,
    serviceAccount: undefined,
  };

  function readOptionValue(index, optionName) {
    const value = argv[index + 1];

    if (!value || value.startsWith("--")) {
      throw new Error(`${optionName} 옵션에는 값이 필요합니다.`);
    }

    return value;
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (arg === "--prune") {
      args.prune = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }

    if (arg === "--project-id") {
      args.projectId = readOptionValue(index, arg);
      index += 1;
      continue;
    }

    if (arg === "--service-account") {
      args.serviceAccount = readOptionValue(index, arg);
      index += 1;
      continue;
    }

    throw new Error(`알 수 없는 옵션입니다: ${arg}`);
  }

  return args;
}

function printHelp() {
  console.log(`Firestore gyms seed

Usage:
  npm run seed:gyms -- --service-account "C:\\path\\to\\service-account.json"
  npm run seed:gyms -- --service-account "C:\\path\\to\\service-account.json" --prune
  npm run seed:gyms -- --service-account "C:\\path\\to\\service-account.json" --dry-run

Options:
  --service-account <path>  Firebase Admin SDK 서비스 계정 JSON 경로
  --project-id <id>         ADC를 사용할 때 명시할 Firebase project id
  --prune                   seed 목록에 없는 gyms 문서를 삭제
  --dry-run                 Firestore에 쓰지 않고 입력 데이터만 검증
  --help                    도움말 출력

GOOGLE_APPLICATION_CREDENTIALS 환경변수를 설정했다면 --service-account 없이도 실행할 수 있습니다.`);
}

function assertString(value, path) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path} 값은 비어 있지 않은 string이어야 합니다.`);
  }
}

function assertNumber(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} 값은 number이어야 합니다.`);
  }
}

function assertStringArray(value, path) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${path} 값은 string array이어야 합니다.`);
  }
}

function validateGym(gym, index) {
  const prefix = `gyms[${index}]`;

  assertString(gym.id, `${prefix}.id`);

  if (gym.id.includes("/")) {
    throw new Error(`${prefix}.id 값에는 "/"를 사용할 수 없습니다.`);
  }

  for (const key of [
    "name",
    "region",
    "address",
    "officialUrl",
    "openHours",
    "description",
  ]) {
    assertString(gym[key], `${prefix}.${key}`);
  }

  for (const key of ["basePrice", "distanceKm", "latitude", "longitude"]) {
    assertNumber(gym[key], `${prefix}.${key}`);
  }

  for (const key of ["facilities", "availableTimes", "closedDays"]) {
    assertStringArray(gym[key], `${prefix}.${key}`);
  }

  assertStringArray(gym.sports, `${prefix}.sports`);

  for (const sport of gym.sports) {
    if (!sports.has(sport)) {
      throw new Error(`${prefix}.sports에 허용되지 않은 종목이 있습니다: ${sport}`);
    }
  }

  if (
    typeof gym.sportPrices !== "object" ||
    gym.sportPrices === null ||
    Array.isArray(gym.sportPrices)
  ) {
    throw new Error(`${prefix}.sportPrices 값은 map이어야 합니다.`);
  }

  for (const [sport, price] of Object.entries(gym.sportPrices)) {
    if (!sports.has(sport)) {
      throw new Error(`${prefix}.sportPrices에 허용되지 않은 종목이 있습니다: ${sport}`);
    }

    assertNumber(price, `${prefix}.sportPrices.${sport}`);
  }
}

async function loadGyms() {
  const source = await readFile(seedDataPath, "utf8");
  const gyms = JSON.parse(source);

  if (!Array.isArray(gyms)) {
    throw new Error(`${fileURLToPath(seedDataPath)} 값은 array이어야 합니다.`);
  }

  gyms.forEach(validateGym);

  return gyms;
}

async function loadCredential(serviceAccountPath) {
  const resolvedPath = serviceAccountPath
    ? resolve(serviceAccountPath)
    : process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!resolvedPath) {
    return {
      credential: applicationDefault(),
      projectId:
        process.env.GOOGLE_CLOUD_PROJECT ||
        process.env.GCLOUD_PROJECT ||
        undefined,
    };
  }

  const serviceAccount = JSON.parse(await readFile(resolvedPath, "utf8"));

  return {
    credential: cert(serviceAccount),
    projectId: serviceAccount.project_id,
  };
}

async function seedGyms({ dryRun, projectId, prune, serviceAccount }) {
  const gyms = await loadGyms();
  const seedIds = new Set(gyms.map((gym) => gym.id));
  const ids = gyms.map((gym) => gym.id).join(", ");

  console.log(`[seed:gyms] ${gyms.length}개 문서를 검증했습니다: ${ids}`);

  if (dryRun) {
    console.log("[seed:gyms] dry-run이라 Firestore에는 쓰지 않았습니다.");
    if (prune) {
      console.log("[seed:gyms] 실제 실행 시 seed 목록에 없는 gyms 문서를 삭제합니다.");
    }
    return;
  }

  const credentialConfig = await loadCredential(serviceAccount);

  initializeApp({
    credential: credentialConfig.credential,
    projectId: projectId || credentialConfig.projectId,
  });

  const db = getFirestore();
  const batch = db.batch();
  const gymsCollection = db.collection("gyms");
  let deletedCount = 0;

  if (prune) {
    const gymsSnapshot = await gymsCollection.get();

    for (const snapshot of gymsSnapshot.docs) {
      if (!seedIds.has(snapshot.id)) {
        batch.delete(snapshot.ref);
        deletedCount += 1;
      }
    }
  }

  for (const gym of gyms) {
    batch.set(gymsCollection.doc(gym.id), gym);
  }

  await batch.commit();

  if (prune) {
    console.log(
      `[seed:gyms] Firestore gyms 컬렉션에 ${gyms.length}개를 저장하고 ${deletedCount}개를 삭제했습니다.`,
    );
    return;
  }

  console.log("[seed:gyms] Firestore gyms 컬렉션에 저장했습니다.");
}

try {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
  } else {
    await seedGyms(args);
  }
} catch (error) {
  console.error(
    `[seed:gyms] 실패: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
