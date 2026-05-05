# Firebase 연결 준비

## 현재 저장소 선택

예약 흐름은 `src/lib/reservation-repository.ts`의 `ReservationRepository`
계약을 기준으로 동작합니다. 현재 실제 구현은 localStorage 기반
`localReservationRepository`이며, 선택 지점은
`src/lib/reservation-repository-provider.ts`입니다.

Firebase 구현을 추가할 때 UI 컴포넌트와 예약 검증 규칙은 그대로 두고,
provider가 반환하는 repository 구현만 교체하는 것을 목표로 합니다.

## 원칙

- 예약 규칙 SSOT는 `src/lib/reservation-rules.ts`입니다.
- 저장 매체 접근은 repository 구현 안에 둡니다.
- Firebase 환경변수가 없거나 초기화에 실패하면 localStorage로 조용히
  fallback하지 않습니다.
- 생성, 취소 같은 mutation은 성공, 중복, 거절, 실패를 명시적인 result로
  반환합니다.
- 같은 예약 취소 요청은 반복되어도 안전해야 합니다.

## Firebase 컬렉션 초안

### gyms

mock `Gym` 타입과 같은 필드를 먼저 사용합니다.

- `id`
- `name`
- `region`
- `address`
- `openHours`
- `basePrice`
- `sports`
- `sportPrices`
- `facilities`
- `availableTimes`
- `closedDays`
- `distanceKm`
- `description`

### reservations

`Reservation` 타입을 기준으로 시작합니다.

- `id`
- `userId`
- `gymId`
- `sport`
- `date`
- `time`
- `price`
- `status`
- `createdAt`

## 다음 구현 순서

1. Firebase SDK 설치
2. `src/lib/firebase-client.ts`에서 공개 환경변수 검증과 앱 초기화
3. `src/lib/firebase-reservation-repository.ts` 구현
4. `reservation-repository-provider.ts`에서 구현 선택
5. Firestore transaction으로 중복 활성 예약 생성 방지
6. 인증 추가 후 `mockUserId`를 실제 `uid`로 교체
