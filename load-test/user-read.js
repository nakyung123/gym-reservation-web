// 테스트 3: 사용자 화면 읽기 경로 부하.
//
// 관리자 화면과 달리 여기는 실제 사용자가 가장 많이 밟는 경로다.
//   - /gyms                    시설 목록 (SSR 페이지)
//   - /api/reservation-slots   슬롯 가용성 (예약 화면 진입마다, 비인증)
//   - /api/reservations        마이페이지 예약 목록 (인증)
//
// 마이페이지 목록은 페이지네이션이 없어 사용자의 전 기간 예약을 한 번에 로드한다.
// 그래서 "예약이 적은 사용자"와 "누적 예약이 많은 단골"을 나눠 잰다.
// 후자가 눈에 띄게 느리면 페이지네이션이 필요하다는 근거가 된다.

import http from "k6/http";
import { Trend } from "k6/metrics";
import { SharedArray } from "k6/data";

const tokens = new SharedArray("tokens", () =>
  JSON.parse(open("./tokens.json")).userTokens,
);
const target = JSON.parse(open("./target.json"));

const tGyms = new Trend("t_gyms_page", true);
const tSlots = new Trend("t_slots", true);
const tMypageLight = new Trend("t_mypage_light", true);
const tMypageHeavy = new Trend("t_mypage_heavy", true);

export const options = {
  scenarios: {
    read: { executor: "constant-vus", vus: 10, duration: "30s" },
  },
};

// heavy 사용자는 seed-bulk heavy로 예약을 몰아준 uid다(기본 k6load-user-0 = 토큰 0번).
const HEAVY_INDEX = 0;

export default function userRead() {
  const base = __ENV.BASE;
  const vu = __VU - 1;

  // 1) 시설 목록 (SSR, 비인증)
  const r1 = http.get(`${base}/gyms`);
  tGyms.add(r1.timings.duration);

  // 2) 슬롯 가용성 (비인증)
  const q = `gymId=${encodeURIComponent(target.gymId)}&sport=${encodeURIComponent(target.sport)}&date=${target.date}`;
  const r2 = http.get(`${base}/api/reservation-slots?${q}`);
  tSlots.add(r2.timings.duration);

  // 3) 마이페이지 목록 — heavy 사용자와 일반 사용자를 분리 계측
  const isHeavy = vu === HEAVY_INDEX;
  const token = tokens[isHeavy ? HEAVY_INDEX : vu];
  const r3 = http.get(`${base}/api/reservations`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  (isHeavy ? tMypageHeavy : tMypageLight).add(r3.timings.duration);

  if (r1.status !== 200 || r2.status !== 200 || r3.status !== 200) {
    console.error(
      `비정상 응답: gyms=${r1.status} slots=${r2.status} mypage=${r3.status}`,
    );
  }
}
