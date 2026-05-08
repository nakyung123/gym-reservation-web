# 데이터 소스 현황

작성 시점: 2026-05-08

## 결론

- **MySQL(Prisma)이 기본 저장소**다. 세 도메인(gym/favorite/reservation) 모두 default가 mysql이다.
- **mock과 local은 개발·테스트 보조용**으로 유지한다.
- **Firestore 어댑터는 legacy 옵션**으로 보존하되, default 분기에서는 제외된다. 향후 제거 여부는 아래 체크리스트로 판단한다.
- **Firebase Auth는 모든 모드에서 유지**된다 (Firestore와 독립).

## 도메인별 현황

| 도메인 | 기본 저장소 | 가능한 옵션 | 환경 변수 |
|---|---|---|---|
| 체육관 (gym) | MySQL | mock / firestore / mysql | `NEXT_PUBLIC_GYM_DATA_SOURCE` |
| 즐겨찾기 (favorite) | MySQL | local / mysql | `NEXT_PUBLIC_FAVORITE_DATA_SOURCE` |
| 예약 (reservation) | MySQL | firestore / mysql | `NEXT_PUBLIC_RESERVATION_DATA_SOURCE` |

각 default는 `src/lib/*-repository-provider.ts`에 정의돼 있다.

## Firebase Auth는 왜 남는가

| 파일 | 줄 수 | 역할 |
|---|---|---|
| `src/lib/firebase-app.ts` | 57 | Firebase 앱 초기화 |
| `src/lib/firebase-client.ts` | 28 | `getAuth` (+ legacy `getFirestore`) |
| `src/lib/firebase-auth-session.ts` | 193 | 클라이언트 anonymous 세션 + 토큰 관리 |
| `src/lib/server/firebase-admin.ts` | 54 | 서버 ID 토큰 검증 |

- mysql 모드에서도 사용자 식별은 Firebase Auth uid를 그대로 쓴다.
- `api-favorite-repository`, `api-reservation-repository`는 호출 시 Firebase ID 토큰을 헤더로 보내고, 서버 라우트는 `verifyIdTokenFromRequest`로 검증한다.
- Firestore 의존과 완전히 분리되므로, Firestore 어댑터를 제거해도 Firebase Auth는 영향받지 않는다.

## mock / local은 왜 남는가

- `mockGymRepository` (`gym-repository.ts` + `mock-data.ts`): `src/data/gyms.json`만 있으면 DB 연결 없이도 화면을 띄울 수 있다. 실패 격리, 디자인 검토, 신규 환경 셋업 첫 단계에서 유용.
- `localStorageFavoriteRepository`: 로그인 없이 즐겨찾기 토글이 가능. 데모/리뷰어가 로컬에서 빠르게 만져볼 때 진입 장벽 제거.

## Firestore 어댑터 — 보존 vs 제거 판단

대상 파일과 코드량:

| 파일 | 줄 수 |
|---|---|
| `src/lib/firebase-reservation-repository.ts` | 518 |
| `src/lib/firebase-gym-repository.ts` | 135 |
| `src/lib/firebase-client.ts`의 `db: getFirestore(app)` 일부 | (일부) |
| **합계 (전용 코드)** | **~660** |

### 보존 근거
- 다중 어댑터 패턴(repository pattern)을 실제로 두 개 이상의 백엔드로 구현해본 사례로 시연 가치.
- MySQL 환경 장애 시 환경변수 한 줄로 즉시 롤백 가능.
- Prisma 스키마 마이그레이션 중 비교 대상.

### 제거 근거
- 약 660줄의 dead code. 새 기능 추가 시 두 번 구현해야 하는 부담.
- 테스트가 없다 (mysql 어댑터에는 9개 통합 테스트 존재).
- Firestore 보안 규칙(`docs/firestore-rules.md`) 유지·동기화 비용.
- 어댑터 인터페이스가 진화할 때 firebase 어댑터의 결함이 늦게 드러날 위험.

### 판단 체크리스트
- [ ] 포트폴리오 발표/면접에서 "다중 어댑터 시연"을 활용할 의향이 있나?
- [ ] 향후 Firebase Auth 외에 Firestore 기반 기능을 추가할 계획이 있나?
- [ ] MySQL 어댑터 관련 변경 시 firebase 어댑터를 함께 유지할 시간 여유가 있나?

위 셋 중 하나라도 "예"면 보존, 모두 "아니오"면 별도 PR로 제거 권장.

## 환경 변수 (default 변경됨)

```
NEXT_PUBLIC_GYM_DATA_SOURCE=mysql
NEXT_PUBLIC_FAVORITE_DATA_SOURCE=mysql
NEXT_PUBLIC_RESERVATION_DATA_SOURCE=mysql
```

각 환경 변수를 명시하지 않으면 mysql로 동작한다. mock/local/firestore로 돌리려면 명시적으로 값을 지정한다.
