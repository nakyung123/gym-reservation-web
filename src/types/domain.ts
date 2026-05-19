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

export type Reservation = {
  id: string;
  userId: string;
  gymId: string;
  sport: Sport;
  date: string;
  time: string;
  price: number;
  status: ReservationStatus;
  createdAt: string;
};

export type ReservationDraft = Omit<
  Reservation,
  "id" | "status" | "createdAt"
>;

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
