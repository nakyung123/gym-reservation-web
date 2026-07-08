import { USER_CANCEL_CUTOFF_MINUTES } from "@/lib/reservation-rules";

// FAQ 안내봇의 지식 SSOT. 봇은 이 안의 내용으로만 답한다(faq-bot.ts가 system에 주입).
//
// 원칙:
// - 시설별 가격·운영시간·위치 같은 구체값은 넣지 않는다(정적 FAQ라 환각·노후 방지). "시설 상세 확인"으로 유도.
// - 결제·환불은 데모 단계임을 명시한다(실결제 게이트웨이 미구현 — 가격은 안내용 표시만).
// - 취소 마감 시한은 reservation-rules.ts의 USER_CANCEL_CUTOFF_MINUTES를 단일 기준으로 따른다(하드코딩 금지).
//
// 각 답변의 근거 코드:
// - 가입 수단(이메일/구글/카카오/네이버): db-customer-repository.ts normalizeProvider
// - 가입 약관 2건(만14세/이용약관): signup-terms-step.tsx TERMS
// - 예약 제한 사유: reservation-rules.ts reservationRuleMessages
// - 취소(변경 기능 없음, 취소만): reservations [reservationId] route.ts DELETE
// - QR 체크인(이용 30분 전부터): mypage-view.tsx isQrTooEarly + reservation-qr-modal.tsx
// - 고객센터 1599-0000 / 평일 09:00–18:00: site-footer.tsx (데모 번호)

const CANCEL_CUTOFF_HOURS = USER_CANCEL_CUTOFF_MINUTES / 60;

export type FaqEntry = { q: string; a: string };
export type FaqCategory = { title: string; entries: FaqEntry[] };

export const FAQ_KNOWLEDGE: FaqCategory[] = [
  {
    title: "가입 / 계정",
    entries: [
      {
        q: "어떻게 가입하나요?",
        a: "이메일 가입 또는 구글·카카오·네이버 간편 로그인으로 가입할 수 있습니다.",
      },
      {
        q: "가입할 때 동의해야 하는 항목이 있나요?",
        a: "필수 2가지에 동의하셔야 합니다 — (1) 만 14세 이상 (2) 서비스 이용약관. 만 14세 미만은 보호자 동의가 필요합니다.",
      },
      {
        q: "탈퇴할 수 있나요?",
        a: "마이페이지에서 회원 탈퇴를 진행할 수 있습니다.",
      },
    ],
  },
  {
    title: "예약",
    entries: [
      {
        q: "예약은 어떻게 하나요?",
        a: "시설을 찾아 원하는 종목·날짜·시간을 선택해 예약합니다. 운영시간·종목·가격 등 자세한 정보는 각 시설 상세 페이지에서 확인해 주세요.",
      },
      {
        q: "예약이 안 돼요.",
        a: "휴관일, 이미 지난 시간, 해당 시설에서 운영하지 않는 종목·시간, 같은 조건의 예약이 이미 있는 경우에는 예약이 제한됩니다.",
      },
    ],
  },
  {
    title: "예약 변경·취소",
    entries: [
      {
        q: "예약을 변경할 수 있나요?",
        a: "별도의 예약 변경 기능은 없습니다. 기존 예약을 취소한 뒤 원하는 시간으로 다시 예약해 주세요.",
      },
      {
        q: "예약을 언제까지 취소할 수 있나요?",
        a: `이용 시작 ${CANCEL_CUTOFF_HOURS}시간 전까지 취소할 수 있습니다. 이미 시작됐거나 이용이 끝난 예약은 취소할 수 없습니다.`,
      },
      {
        q: "취소는 어디서 하나요?",
        a: "예약 조회(내 예약) 화면에서 해당 예약을 선택해 취소합니다.",
      },
    ],
  },
  {
    title: "체크인 / 입장",
    entries: [
      {
        q: "현장에서 어떻게 입장하나요?",
        a: "마이페이지 예약 내역의 'QR코드' 버튼으로 QR 체크인 화면을 열 수 있습니다. QR 코드는 예약 시간 30분 전부터 확인할 수 있으며, 방문 시 이 QR 코드로 체크인합니다.",
      },
    ],
  },
  {
    title: "결제",
    entries: [
      {
        q: "결제는 어떻게 하나요?",
        a: "현재 온라인 결제 기능은 준비 중입니다. 화면에 표시되는 가격은 안내용이며 실제 결제는 이루어지지 않습니다.",
      },
    ],
  },
  {
    title: "환불",
    entries: [
      {
        q: "환불은 어떻게 되나요?",
        a: "온라인 결제가 준비 중이라 현재 환불 절차도 제공되지 않습니다. 예약 취소는 '예약 변경·취소' 안내를 따라 주세요.",
      },
    ],
  },
  {
    title: "고객센터 / 문의",
    entries: [
      {
        q: "문의는 어디로 하나요?",
        a: "고객센터 1599-0000(평일 09:00–18:00, 주말·공휴일 휴무)으로 문의해 주세요.",
      },
    ],
  },
];

// system 프롬프트에 넣을 지식 직렬화. 매 요청 동일(frozen)해야 prompt caching prefix가 유지되므로
// 날짜·세션ID 등 요청마다 달라지는 값은 절대 섞지 않는다.
export function buildFaqKnowledgeText(): string {
  return FAQ_KNOWLEDGE.map((category) => {
    const lines = category.entries
      .map((entry) => `- Q: ${entry.q}\n  A: ${entry.a}`)
      .join("\n");
    return `## ${category.title}\n${lines}`;
  }).join("\n\n");
}
