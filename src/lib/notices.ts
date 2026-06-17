// 공지사항 SSOT(데모 정적 데이터). 운영 시 CMS/DB로 교체 가능하나 현재는 데모라 정적 배열로 둔다.
// 항목 추가·삭제는 이 배열만 수정하면 목록/상세 페이지가 함께 따라온다(구조 유연성 우선).

export type NoticeCategory = "공지" | "점검" | "안내";

export type Notice = {
  id: string;
  category: NoticeCategory;
  title: string;
  date: string; // YYYY-MM-DD (발행일)
  body: string; // 단락은 빈 줄(\n\n)로 구분
};

const NOTICES: Notice[] = [
  {
    id: "faq-bot-open",
    category: "안내",
    title: "AI 문의 도우미 오픈 안내",
    date: "2026-06-17",
    body: [
      "자주 묻는 질문에 빠르게 답해 드리는 AI 문의 도우미가 오픈했습니다.",
      "화면 우측 하단의 '문의하기' 버튼을 누르면 가입·예약·취소·이용 방법 등에 대해 대화형으로 안내받을 수 있습니다.",
      "안내 도우미가 답하기 어려운 문의는 고객센터(1599-0000, 평일 09:00~18:00)로 연락해 주세요.",
    ].join("\n\n"),
  },
  {
    id: "summer-hours-2026",
    category: "공지",
    title: "하계(7~8월) 운영시간 안내",
    date: "2026-06-15",
    body: [
      "7월 1일부터 8월 31일까지 하계 운영시간이 적용됩니다.",
      "일부 실내 시설은 폭염 대응을 위해 정규 운영시간을 단축 또는 조정하며, 야외 시설은 이용 가능 시간대가 변경될 수 있습니다. 시설별 상세 운영시간은 각 시설 상세 페이지에서 확인해 주세요.",
      "예약은 평소와 동일하게 진행되며, 변경된 운영시간 외 시간대는 예약이 제한됩니다.",
    ].join("\n\n"),
  },
  {
    id: "system-maintenance-2026-06",
    category: "점검",
    title: "예약 시스템 정기 점검 안내",
    date: "2026-06-10",
    body: [
      "보다 안정적인 서비스 제공을 위해 예약 시스템 정기 점검을 실시합니다.",
      "점검 일시: 매월 둘째 주 화요일 02:00~04:00\n점검 시간 동안 예약 생성·변경·취소가 일시 중단됩니다.",
      "점검 시간에는 접속이 원활하지 않을 수 있으니 양해 부탁드립니다. 이미 완료된 예약은 그대로 유지됩니다.",
    ].join("\n\n"),
  },
  {
    id: "new-center-geumcheon",
    category: "안내",
    title: "금천구민체육센터 신규 오픈",
    date: "2026-06-01",
    body: [
      "금천구민체육센터가 새롭게 문을 열었습니다.",
      "배드민턴·탁구·헬스장 등 다양한 종목을 이용하실 수 있으며, 예약은 시설 찾기에서 '금천구'로 검색해 진행할 수 있습니다.",
      "자세한 운영시간·종목·이용요금은 시설 상세 페이지에서 확인해 주세요.",
    ].join("\n\n"),
  },
  {
    id: "privacy-policy-update",
    category: "공지",
    title: "개인정보 처리방침 개정 안내",
    date: "2026-05-20",
    body: [
      "개인정보 처리방침이 일부 개정되어 안내드립니다.",
      "주요 변경 사항은 수집 항목 및 보관 기간의 명확화이며, 자세한 내용은 추후 공지되는 전문을 통해 확인하실 수 있습니다.",
      "서비스 이용에는 영향이 없으며, 관련 문의는 고객센터로 연락해 주세요.",
    ].join("\n\n"),
  },
];

// 최신 발행일 순으로 정렬해 반환.
export function listNotices(): Notice[] {
  return [...NOTICES].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );
}

export function getNotice(id: string): Notice | null {
  return NOTICES.find((notice) => notice.id === id) ?? null;
}
