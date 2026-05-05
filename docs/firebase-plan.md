# Firebase 연결 준비

## 현재 저장소 선택

예약 흐름은 `src/lib/reservation-repository.ts`의 `ReservationRepository`
계약을 기준으로 동작합니다. 현재 실제 구현은 Firestore 기반
`firebaseReservationRepository`이며, 선택 지점은
`src/lib/reservation-repository-provider.ts`입니다.

localStorage 기반 `localReservationRepository`는 비교와 임시 롤백을 위한
대체 구현으로 남겨둡니다. provider에서 조용히 fallback하지 않습니다.

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

추가 저장 필드:

- `activeKey`: 활성 중복 예약 방지용 키

### reservationLocks

동일 사용자, 체육관, 종목, 날짜, 시간의 활성 예약 중복 생성을 막는 lock
컬렉션입니다. 예약 생성/취소는 Firestore transaction 안에서 이 문서와
`reservations` 문서를 함께 처리합니다.

- `activeKey`
- `reservationId`
- `status`
- `updatedAt`

## 다음 구현 순서

1. Firebase SDK 설치 완료
2. `src/lib/firebase-client.ts`에서 공개 환경변수 검증과 앱 초기화 완료
3. `src/lib/firebase-reservation-repository.ts` 구현 완료
4. `reservation-repository-provider.ts`에서 Firestore 구현 선택 완료
5. Firestore transaction으로 중복 활성 예약 생성 방지 완료
6. 인증 추가 후 `DEMO_USER_ID`를 실제 `uid`로 교체
