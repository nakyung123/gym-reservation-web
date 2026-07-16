// 회원가입/소셜 로그인 직후 nickname을 자동 부여하기 위한 단어 사전.
// nickname은 unique 제약을 만족시키는 내부 시스템 값이며, 현재 사용자에게 노출·편집되지 않는다
// (프로필 편집·닉네임 검색 UI 폐기). DB 컬럼은 문의 표시명 최후 폴백 등으로 유지된다.
// 8자 제한을 지키기 위해 단어는 2~4자 위주로 구성한다.

const ADJECTIVES = [
  "강한",
  "빠른",
  "멋진",
  "밝은",
  "용감한",
  "친절한",
  "똑똑한",
  "귀여운",
  "게으른",
  "활발한",
  "조용한",
  "부지런",
  "신비한",
  "행복한",
  "순수한",
  "다정한",
  "신나는",
  "즐거운",
  "잠많은",
  "졸린",
  "든든한",
  "푸른",
  "우아한",
  "영리한",
  "진지한",
  "깔끔한",
  "단단한",
  "가벼운",
  "빛나는",
  "굳센",
  "익살",
  "따뜻한",
  "차가운",
  "단호한",
  "유쾌한",
  "재빠른",
  "느긋한",
  "강철",
  "황금",
  "은빛",
  "초록",
  "분홍",
  "검은",
  "하얀",
  "노란",
  "보라",
  "끈기있",
  "정직한",
  "솔직한",
  "당당한",
];

const NOUNS = [
  "쿠키",
  "고양이",
  "토끼",
  "거북이",
  "다람쥐",
  "부엉이",
  "곰돌이",
  "호랑이",
  "사슴",
  "여우",
  "펭귄",
  "햄스터",
  "강아지",
  "너구리",
  "두더지",
  "코끼리",
  "기린",
  "사자",
  "늑대",
  "판다",
  "코알라",
  "친구",
  "거인",
  "영웅",
  "천사",
  "마법사",
  "도깨비",
  "요정",
  "인간",
  "시민",
  "학생",
  "영혼",
  "선수",
  "달팽이",
  "악어",
  "참새",
  "독수리",
  "비둘기",
  "올빼미",
  "다람이",
  "토토",
  "별빛",
  "구름",
  "바람",
  "나비",
  "벌새",
  "잠자리",
  "물개",
  "수달",
  "오리",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 한글 자모/이모지를 고려해 글자 수는 codepoint 기준으로 센다.
function charLength(value: string): number {
  return [...value].length;
}

// 형용사 + 명사 (+ optional 숫자). 8자 이내가 될 때까지 100번까지 시도.
// addNumberSuffix=true면 끝에 1~99 숫자를 붙여 충돌 확률을 낮춘다.
export function generateRandomNickname(addNumberSuffix = false): string {
  for (let i = 0; i < 100; i += 1) {
    const adj = pickRandom(ADJECTIVES);
    const noun = pickRandom(NOUNS);
    let nick = adj + noun;
    if (addNumberSuffix) {
      const n = Math.floor(Math.random() * 99) + 1;
      nick = nick + String(n);
    }
    if (charLength(nick) <= 8) return nick;
  }
  // 안전망: 이론상 도달하지 않지만 fallback.
  return "초보" + String(Math.floor(Math.random() * 9999) + 1);
}
