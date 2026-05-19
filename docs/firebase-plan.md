# Firebase 연결 (현재 상태)

최종 갱신: 2026-05-19

## 사용 범위 — Auth만

이 저장소에서 Firebase는 **인증(Authentication)** 용도로만 사용한다. 데이터 저장소는 Postgres(Supabase 운영 / Docker dev)이며 Prisma를 통해 접근한다.

- ✅ 사용: Firebase Auth (이메일·Google·카카오·네이버 custom token), Firebase Admin SDK (서버 ID 토큰 검증, 회원 탈퇴 시 user delete)
- ❌ 폐기: Firestore. 운영 분기 + repository 어댑터 모두 제거됨 (2026-05-19)
- ❌ 폐기: Firebase Storage. 프로필 사진은 base64로 Postgres `user_profiles.photo_base64` 컬럼에 저장

## 사용자 식별 SSOT

`Firebase Auth.uid`. 모든 비즈니스 데이터(`user_profiles`, `reservations`, `favorites` 등)의 `userId` 컬럼은 이 uid를 그대로 쓴다.

카카오·네이버 흐름은 OAuth 인증 후 서버에서 Firebase custom token을 발급한다 (`oauth_attempts`, `auth_handover_tickets` 테이블이 흐름 상태를 추적).

## 클라이언트 측 (`src/lib/firebase-*.ts`)

| 파일 | 역할 |
|---|---|
| `firebase-app.ts` | Firebase 앱 초기화 (NEXT_PUBLIC_ 환경변수 검증) |
| `firebase-client.ts` | `getAuth` 캐시. Firestore 의존 제거됨 |
| `firebase-auth-session.ts` | useSyncExternalStore 기반 세션 + ID 토큰 관리 |
| `firebase-password-update.ts` | 재인증 + 비밀번호 변경 wrapper |

## 서버 측 (`src/lib/server/firebase-admin.ts`)

- 옵션 ㄴ (Vercel 권장): `FIREBASE_ADMIN_PROJECT_ID` / `FIREBASE_ADMIN_CLIENT_EMAIL` / `FIREBASE_ADMIN_PRIVATE_KEY` 3개 환경변수로 `cert()` 초기화
- 옵션 ㄱ (로컬 dev): `GOOGLE_APPLICATION_CREDENTIALS` 경로의 서비스 계정 JSON

`verifyIdTokenFromRequest`(`src/lib/server/auth.ts`)가 모든 인증 보호 API 경로의 입구다.

## 원칙

- 예약/취소 같은 mutation은 성공/중복/거절/실패를 명시적 result로 반환한다 (silent fallback 금지).
- 같은 예약 취소 요청은 반복돼도 안전해야 한다 (idempotency).
- Firebase 환경변수가 없거나 초기화에 실패하면 명시적으로 throw한다.
- 비밀값(서비스 계정 JSON, Admin private key)은 로그/응답/채팅에 포함하지 않는다.

## 폐기 항목 (2026-05-19)

- `src/lib/firebase-gym-repository.ts` — 운영 SSOT를 DB로 통합하면서 제거
- `src/lib/firebase-reservation-repository.ts` — 같은 작업에서 제거
- `scripts/seed-gyms.mjs` (Firestore gyms seed) — 제거
- `docs/firestore-rules.md`, `docs/firestore-gyms-seed.md` — 제거
- 옛 `NEXT_PUBLIC_*_DATA_SOURCE` 환경 변수 — provider에서 throw

자세한 데이터 백엔드 현황은 [`data-source-status.md`](data-source-status.md) 참고.
