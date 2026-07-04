export type Sport =
  | "배드민턴"
  | "농구"
  | "풋살"
  | "탁구"
  | "배구";

export type Gym = {
  id: string;
  name: string;
  region: string;
  address: string;
  officialUrl: string;
  openHours: string;
  basePrice: number;
  sports: Sport[];
  sportPrices: Partial<Record<Sport, number>>;
  facilities: string[];
  availableTimes: string[];
  closedDays: string[];
  // 사용자 현재 위치 기반 거리 계산의 SSOT. 좌표 없는 체육관은 등록할 수 없다.
  latitude: number;
  longitude: number;
  description: string;
};

export type AdminGym = Gym & {
  isActive: boolean;
};

export type ReservationStatus = "reserved" | "cancelled" | "used";

// 결제 수단(포트폴리오 데모). 예약 시 고른 방식만 저장하고 실제 PG 연동은 없다.
export type PaymentMethod = "card" | "easy-pay" | "virtual-account";

export type Reservation = {
  id: string;
  userId: string;
  gymId: string;
  sport: Sport;
  date: string;
  time: string;
  price: number;
  status: ReservationStatus;
  // 예약 시 고른 결제 수단. 결제 수단 도입 이전 예약은 null.
  paymentMethod: PaymentMethod | null;
  createdAt: string;
};

// people은 전송용 transient 필드다. DB에 별도 컬럼으로 저장하지 않으며,
// 서버가 price를 단가 × clamp(people)로 재계산해 기존 price 컬럼에 합산가로 저장한다.
// paymentMethod도 선택적으로 실어 보낸다(미전송 시 서버가 null로 저장).
export type ReservationDraft = Omit<
  Reservation,
  "id" | "status" | "createdAt" | "paymentMethod"
> & { people?: number; paymentMethod?: PaymentMethod | null };

// 공개 문의 게시판(문의·FAQ '문의' 탭). 분류(카테고리).
export type VocCategory = "inquiry" | "praise" | "complaint" | "suggestion";

// 공개 응답용 게시글 형태. 연락처/이메일/비밀번호 등 민감정보는 포함하지 않는다.
// authorName은 서버에서 마스킹된 값(예: 홍*동)만 내려온다.
export type VocPost = {
  id: string;
  category: VocCategory;
  gymId: string | null;
  authorName: string;
  title: string;
  // 본문은 비밀번호 인증 후에만 채워진다(목록 응답에서는 빈 문자열).
  body: string;
  createdAt: string;
};

// 1:1 문의. status: open(접수) | answered(답변완료).
// gymId는 시설 관련 문의면 연결, 일반 문의면 null. answer/answeredAt은 관리자 답변 시 채워진다.
export type InquiryStatus = "open" | "answered";

export type Inquiry = {
  id: string;
  userId: string;
  gymId: string | null;
  title: string;
  body: string;
  status: InquiryStatus;
  answer: string | null;
  answeredAt: string | null; // ISO
  createdAt: string; // ISO
};

export type ReservationSlotAvailability = {
  gymId: string;
  sport: Sport;
  date: string;
  time: string;
  capacity: number;
  reservedCount: number;
  remaining: number;
  isClosed: boolean;
  status: "available" | "full" | "closed";
};
