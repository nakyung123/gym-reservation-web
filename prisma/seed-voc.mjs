// 일회성 데모 시드: 공개 문의 게시판(voc_posts)에 한글 더미 15개를 채운다.
// 목록 페이지네이션(10개/페이지) 확인용. 기존 글은 모두 삭제하고 새로 넣는다(멱등).
//
// 실행:
//   로컬:  npm run db:seed:voc
//
// 안전장치: 대상 DB가 로컬(localhost/127.0.0.1)이 아니면 --confirm-prod 없이는 거부한다
// (다른 prisma/*.mjs 스크립트와 동일한 심층 방어).
import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const prisma = new PrismaClient();

// voc-password.ts와 동일한 저장 형식(scrypt$saltHex$hashHex).
function hashVocPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function maskedDbHost() {
  return (process.env.DATABASE_URL ?? "(미정의)").replace(
    /\/\/[^@]+@/,
    "//***:***@",
  );
}

// 분류 라벨(domain-constants VOC_CATEGORY_LABELS와 동일). title은 분류 라벨을 쓴다.
const CATEGORY_LABELS = {
  inquiry: "문의합니다",
  praise: "칭찬합니다",
  complaint: "건의합니다",
  suggestion: "제안합니다",
};

// gymId는 실제 존재하는 gym id에서 고른다(없으면 null=전체). 아래는 시드 후보.
const GYM_POOL = [
  "jongno-culture-sports-center",
  "seongdong-community-sports-center",
  "mapo-community-sports-center",
  "seongbuk-community-sports-center",
  "sadang-sports-complex",
  "jayang-culture-sports-center",
  "geumcheon-culture-sports-center",
  "nowon-community-sports-center",
];

// 더미 15개(성명·문의 모두 한글). category를 골고루 섞는다. gymIndex=null이면 전체.
const DUMMY = [
  { name: "김민준", category: "inquiry", gymIndex: 0, body: "수영장 자유수영 시간표가 주말에도 동일한지 문의드립니다. 토요일 오전에 이용하고 싶은데 예약 가능한 시간이 궁금합니다." },
  { name: "이서연", category: "praise", gymIndex: 1, body: "지난주에 배드민턴장을 이용했는데 시설이 깨끗하고 안내해 주신 직원분이 정말 친절하셨습니다. 덕분에 기분 좋게 운동하고 왔습니다. 감사합니다." },
  { name: "박도윤", category: "complaint", gymIndex: 2, body: "헬스장 샤워실 온수가 잘 나오지 않는 날이 있었습니다. 점검 한번 부탁드립니다." },
  { name: "최지우", category: "suggestion", gymIndex: 7, body: "예약 취소를 앱에서 바로 할 수 있으면 좋겠습니다. 전화로만 취소가 되는 것 같아 조금 불편했습니다." },
  { name: "정하은", category: "inquiry", gymIndex: 3, body: "농구장 대관은 단체만 가능한가요, 아니면 개인도 시간 단위로 예약할 수 있나요? 이용 방법을 알고 싶습니다." },
  { name: "강시우", category: "praise", gymIndex: 4, body: "주차 공간이 넓어서 차를 가지고 방문하기 편했습니다. 앞으로도 자주 이용할 예정입니다." },
  { name: "윤서준", category: "complaint", gymIndex: 5, body: "탁구대 하나가 흔들려서 이용에 불편이 있었습니다. 확인 부탁드립니다." },
  { name: "임지호", category: "inquiry", gymIndex: 5, body: "회원 등록 없이 일일권으로도 이용이 가능한지 궁금합니다. 가능하다면 요금도 알려주세요." },
  { name: "한예린", category: "suggestion", gymIndex: 6, body: "요가 프로그램 저녁반이 있으면 좋겠습니다. 직장인이라 낮 시간에는 참여가 어렵습니다." },
  { name: "오지훈", category: "praise", gymIndex: 7, body: "예약 시스템이 이전보다 훨씬 편해졌습니다. 원하는 시간에 바로 예약할 수 있어서 좋았습니다." },
  { name: "서다은", category: "inquiry", gymIndex: 0, body: "우천 시 실외 코트 예약은 어떻게 처리되나요? 자동으로 취소되는지 아니면 직접 취소해야 하는지 궁금합니다." },
  { name: "신재원", category: "complaint", gymIndex: 1, body: "락커 열쇠 반납대가 잘 보이지 않아 한참 찾았습니다. 안내 표지가 있으면 좋겠습니다." },
  { name: "문가은", category: "suggestion", gymIndex: 2, body: "어린이 동반 이용 시 유아 휴게 공간이 있으면 좋겠습니다. 아이와 함께 방문하는 부모가 많을 것 같습니다." },
  { name: "배준호", category: "inquiry", gymIndex: 6, body: "단체 예약 시 인원 변경은 예약 후에도 가능한가요? 참여 인원이 유동적이라 문의드립니다." },
  { name: "조수아", category: "praise", gymIndex: 3, body: "강습 선생님이 초보자도 이해하기 쉽게 잘 가르쳐 주셨습니다. 다음 기수도 꼭 신청하려고 합니다." },
];

async function main() {
  const confirmedProd = process.argv.includes("--confirm-prod");
  const dbUrl = process.env.DATABASE_URL ?? "";
  const isLocalDb = dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1");

  console.log(`대상 DB: ${maskedDbHost()}`);

  if (!isLocalDb && !confirmedProd) {
    console.error(
      "[seed-voc] 대상 DB가 로컬이 아닙니다. 운영 DB에 더미를 넣으려면 의도를 명시해\n" +
        "           `--confirm-prod` 플래그와 함께 다시 실행하세요. 안전을 위해 중단합니다.",
    );
    process.exitCode = 1;
    return;
  }

  // 기존 글(깨진 더미 포함) 전부 삭제 후 재삽입.
  const deleted = await prisma.vocPost.deleteMany({});
  console.log(`기존 voc_posts ${deleted.count}건 삭제`);

  // gymId가 실제 존재하는지 확인(없는 id는 null=전체로 대체).
  const gyms = await prisma.gym.findMany({ select: { id: true } });
  const existingIds = new Set(gyms.map((g) => g.id));

  const base = Date.now();
  let created = 0;
  for (let i = 0; i < DUMMY.length; i++) {
    const item = DUMMY[i];
    const candidateGymId =
      item.gymIndex === null ? null : (GYM_POOL[item.gymIndex] ?? null);
    const gymId =
      candidateGymId && existingIds.has(candidateGymId) ? candidateGymId : null;
    // 최신 글이 위로 오도록 뒤 항목일수록 과거 시각(1.7시간 간격).
    const createdAt = new Date(base - i * 1000 * 60 * 100);

    await prisma.vocPost.create({
      data: {
        category: item.category,
        gymId,
        authorName: item.name,
        phone: "010-0000-0000",
        email: "user@example.com",
        title: CATEGORY_LABELS[item.category],
        body: item.body,
        passwordHash: hashVocPassword("1234"),
        createdAt,
      },
    });
    created += 1;
  }
  console.log(`더미 voc_posts ${created}건 삽입 완료(비밀번호 전부 1234)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
