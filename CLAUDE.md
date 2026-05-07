반드시 지켜야 할 6원칙:
1. SSOT
   - 예약 규칙은 `src/lib/reservation-rules.ts`
   - 저장소 선택은 `src/lib/reservation-repository-provider.ts`
   - 체육관 가격/검색/종목 계산은 `src/lib/gym-utils.ts`
   - 같은 기준을 컴포넌트 안에 새로 중복 작성하지 말 것

2. SRP
   - 화면 컴포넌트는 UI 표현에 집중할 것
   - Firebase, repository, 예약 규칙 파일의 책임을 UI 파일로 가져오지 말 것

3. 일관성
   - 같은 상태는 같은 문구, 색상, 버튼 스타일로 표현할 것
   - 예약 가능/예약 완료/취소됨/오류 상태를 화면마다 다르게 표현하지 말 것

4. 원자성
   - 예약 생성/취소 흐름의 단위 동작을 쪼개서 깨뜨리지 말 것
   - Firestore transaction 기반 로직을 변경하지 말 것

5. 멱등성
   - 이미 취소된 예약, 이미 생성된 예약 같은 반복 상황에서 UI가 깨지지 않게 할 것
   - 같은 사용자 행동을 반복해도 화면 상태가 꼬이지 않게 할 것

6. 말없는 fallback 금지
   - Firebase 오류나 예약 실패를 숨기지 말 것
   - 실패했는데 성공처럼 보이게 만들지 말 것
   - localStorage/mock 데이터로 조용히 대체하지 말 것