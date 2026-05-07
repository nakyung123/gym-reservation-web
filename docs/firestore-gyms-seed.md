# Firestore 체육관 초기 데이터

`NEXT_PUBLIC_GYM_DATA_SOURCE=firestore`로 전환하기 전에 Firebase 콘솔에서
`gyms` 컬렉션을 만들고 아래 문서를 추가합니다.

주의할 점:

- 문서 id와 문서 안의 `id` 값은 반드시 같아야 합니다.
- `basePrice`, `distanceKm`, `sportPrices` 값은 number 타입으로 입력합니다.
- `sports`, `facilities`, `availableTimes`, `closedDays`는 array 타입입니다.
- `sportPrices`는 map 타입입니다.
- Firestore Rules에 `gyms` 공개 read 규칙을 먼저 적용합니다.

## cheongun-gym

```json
{
  "id": "cheongun-gym",
  "name": "청운체육관",
  "region": "종로구",
  "address": "서울특별시 종로구",
  "openHours": "06:00 - 22:00",
  "basePrice": 4000,
  "sports": ["배드민턴", "농구", "탁구"],
  "sportPrices": {
    "배드민턴": 4000,
    "농구": 6000,
    "탁구": 3000
  },
  "facilities": ["샤워실", "주차장", "장비 대여"],
  "availableTimes": ["09:00", "10:00", "13:00", "19:00", "20:00"],
  "closedDays": ["둘째 월요일"],
  "distanceKm": 1.8,
  "description": "동네 주민이 실내 코트를 예약하고 생활체육 모임을 만들 수 있는 공공체육관입니다."
}
```

## sillim-sports-center

```json
{
  "id": "sillim-sports-center",
  "name": "신림스포츠센터",
  "region": "관악구",
  "address": "서울특별시 관악구",
  "openHours": "07:00 - 21:00",
  "basePrice": 5000,
  "sports": ["풋살", "배드민턴"],
  "sportPrices": {
    "풋살": 12000,
    "배드민턴": 5000
  },
  "facilities": ["야외 구장", "탈의실", "음수대"],
  "availableTimes": ["08:00", "11:00", "15:00", "18:00", "20:00"],
  "closedDays": ["매주 일요일"],
  "distanceKm": 3.4,
  "description": "개인 사용자와 소규모 팀이 풋살장과 배드민턴 코트를 예약할 수 있는 생활체육 시설입니다."
}
```

## guro-community-gym

```json
{
  "id": "guro-community-gym",
  "name": "구로구민체육관",
  "region": "구로구",
  "address": "서울특별시 구로구",
  "openHours": "06:30 - 22:30",
  "basePrice": 3500,
  "sports": ["배구", "농구"],
  "sportPrices": {
    "배구": 4500,
    "농구": 5500
  },
  "facilities": ["관람석", "샤워실", "개인 사물함"],
  "availableTimes": ["07:00", "12:00", "14:00", "17:00", "21:00"],
  "closedDays": ["공휴일"],
  "distanceKm": 5.1,
  "description": "합리적인 가격의 코트 예약과 QR 기반 입장 확인을 목표로 하는 구민 체육시설입니다."
}
```

## 전환 확인

1. Firebase 콘솔에서 위 3개 문서를 추가합니다.
2. Firestore Rules에 `gyms` 공개 read 규칙을 적용합니다.
3. `.env.local`에서 `NEXT_PUBLIC_GYM_DATA_SOURCE=firestore`로 설정합니다.
4. `npm run dev`를 다시 시작합니다.
5. `http://localhost:3000`, `/gyms`, `/gyms/cheongun-gym`,
   `/reserve/cheongun-gym`, `/reservations`에서 체육관 정보가 이전과 같게
   보이는지 확인합니다.
