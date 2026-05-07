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
  distanceKm: number;
  description: string;
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
