# 공공체육관 예약 웹

서울 공공체육시설을 탐색하고 예약 흐름을 체험할 수 있는 Next.js 기반 웹 애플리케이션입니다.

## 프로젝트 소개

공공체육관 예약 웹은 대학 캡스톤에서 기획했던 공공체육관 예약 앱 아이디어를 웹 환경에 맞게 다시 구현한 프로젝트입니다.

사용자는 서울 공공체육시설 샘플 데이터를 바탕으로 체육관을 검색하고, 종목과 날짜, 시간대를 선택해 예약을 생성할 수 있습니다. 생성된 예약은 실제 시설 예약으로 접수되지 않으며, 예약 흐름과 운영 관리 기능을 검증하기 위한 데이터로 동작합니다.

현재 저장소는 MySQL과 Prisma를 기본 데이터 저장소로 사용하고, Firebase Auth 익명 세션으로 사용자를 식별합니다. 관리자 화면에서는 예약 상태, 시간대별 슬롯, 시설 정보를 관리할 수 있습니다.

## 주요 기능

- 서울 공공체육시설 목록 조회
- 체육관 이름, 지역구, 종목 기반 검색 및 필터
- 체육관 상세 정보, 운영시간, 휴관일, 종목별 이용료 확인
- 즐겨찾기 등록 및 해제
- Firebase Auth 익명 세션 기반 사용자 식별
- 예약 생성, 목록 조회, 상세 조회, 취소
- 예약 목록과 상세 화면의 모바일 입장권 확인
- 동일 사용자 기준 중복 활성 예약 방지
- 시간대별 예약 정원과 마감 상태 관리
- 관리자 예약 목록, 상세 조회, 이용 완료, 취소 처리
- 관리자 슬롯 단건 변경과 현재 조회 날짜 기준 일괄 변경
- 관리자 시설 추가, 수정, 활성/비활성 관리

## 기술 스택

| 영역 | 기술 |
|---|---|
| Framework | Next.js 16 App Router |
| UI | React 19, Tailwind CSS 4 |
| Language | TypeScript |
| Database | MySQL |
| ORM | Prisma |
| Auth | Firebase Auth |
| Test | Vitest |
| CI | GitHub Actions |

## 실행 방법

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env.local`에 Firebase 웹 앱 설정, MySQL 연결 정보, 관리자 API 토큰을 설정합니다. 실제 값은 저장소에 커밋하지 않습니다.

```bash
DATABASE_URL=
ADMIN_API_TOKEN=

NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

NEXT_PUBLIC_GYM_DATA_SOURCE=mysql
NEXT_PUBLIC_FAVORITE_DATA_SOURCE=mysql
NEXT_PUBLIC_RESERVATION_DATA_SOURCE=mysql
```

### 3. DB 마이그레이션 및 seed

```bash
npm run db:migrate:deploy
npm run db:seed
```

### 4. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

### 5. 관리자 화면

관리자 화면은 `http://localhost:3000/admin`에서 진입합니다.

- `/admin/reservations`: 예약 조회, 상세 확인, 이용 완료, 관리자 취소
- `/admin/reservation-slots`: 날짜, 종목, 시간대별 정원과 마감 상태 단건/일괄 관리
- `/admin/gyms`: 시설 추가, 수정, 활성/비활성 관리

관리자 API 요청에는 `.env.local`의 `ADMIN_API_TOKEN`과 같은 값을 화면에 저장해야 합니다. 토큰은 브라우저 `sessionStorage`에만 저장됩니다.

## 프로젝트 구조

```text
gym-reservation-web/
├─ prisma/
│  ├─ migrations/          # MySQL 스키마 변경 이력
│  ├─ schema.prisma        # Prisma 모델 정의
│  └─ seed.mjs             # 체육관 seed 데이터 반영
├─ src/
│  ├─ app/                 # Next.js App Router 페이지와 API Route Handler
│  ├─ components/          # 화면 컴포넌트
│  ├─ data/                # 체육관 seed/mock 기준 JSON
│  ├─ hooks/               # 클라이언트 훅
│  ├─ lib/                 # 도메인 규칙, repository, API client, 서버 로직
│  └─ types/               # 공통 도메인 타입
├─ tests/                  # 테스트 환경 설정
└─ docs/                   # 설계와 운영 문서
```

## 아키텍처

사용자 화면은 Next.js Server Component에서 체육관 데이터를 조회하고, 예약·즐겨찾기처럼 사용자 세션이 필요한 기능은 Client Component와 API Route Handler를 통해 처리합니다.

```text
Client UI
  ├─ Firebase Auth 익명 세션
  ├─ 사용자 예약/즐겨찾기 API 호출
  └─ 관리자 API 호출

Next.js Route Handler
  ├─ Firebase ID token 검증
  ├─ 관리자 token 검증
  └─ 도메인 서비스 호출

Repository / Service
  ├─ 예약 규칙 검증
  ├─ 중복 활성 예약 방지
  ├─ 슬롯 정원 계산
  └─ Prisma transaction

MySQL
  ├─ gyms
  ├─ gym_sports
  ├─ favorites
  ├─ reservations
  ├─ reservation_locks
  └─ reservation_slots
```

데이터 소스는 repository provider에서 선택합니다. 기본값은 MySQL이며, mock/local/Firestore 어댑터는 개발 보조 또는 legacy 옵션으로 남겨두었습니다.

## 기술적 이슈 & 해결

### 중복 예약 방지

같은 사용자가 같은 체육관, 종목, 날짜, 시간대에 활성 예약을 중복 생성하지 못하도록 `reservation_locks` 테이블을 둡니다. 예약 생성은 Prisma transaction 안에서 슬롯 카운터 증가, 예약 생성, lock 생성을 함께 처리합니다.

### 슬롯 정원 경쟁 상태

동시에 여러 예약이 들어와도 정원을 초과하지 않도록 MySQL 조건부 update를 사용합니다. `reserved_count < capacity` 조건을 만족할 때만 카운터를 증가시키고, 실패하면 예약을 생성하지 않습니다.

### 예약 취소 정책

사용자 취소는 이용 시작 2시간 전까지만 허용합니다. 취소가 성공하면 예약 상태를 `cancelled`로 바꾸고, 활성 lock을 제거하며, 슬롯 예약 카운터를 감소시킵니다.

### 관리자 시설 관리와 공개 목록 분리

관리자는 비활성 시설도 조회하고 수정할 수 있어야 하지만, 사용자 공개 목록에는 운영 중인 시설만 노출되어야 합니다. 이를 위해 `gyms.is_active`를 추가하고, 공개 repository와 관리자 repository를 분리했습니다.

### 관리자 슬롯 변경 검증

관리자 슬롯 변경은 단건 저장과 일괄 저장 모두 같은 서버 검증을 통과해야 합니다. 존재하지 않는 시설·종목 조합, 변경 대상 시설 불일치, 예약 인원보다 낮은 정원, 허용 범위를 벗어난 정원은 저장하지 않고 명시적인 오류를 반환합니다.

## 성능 개선

- 체육관 목록과 상세 화면은 Server Component에서 데이터를 조회해 초기 렌더링에 필요한 클라이언트 JavaScript를 줄였습니다.
- `/gyms/[id]`, `/reserve/[gymId]`는 현재 활성 체육관 목록을 기준으로 정적 경로를 생성합니다.
- 예약 가능 시간대는 시설의 `availableTimes`와 저장된 `reservation_slots`를 조합해 필요한 날짜·종목 범위만 조회합니다.
- 관리자 화면은 목록 조회와 저장 요청을 분리해 필요한 시점에만 API를 호출합니다.

## 테스트

```bash
npx tsc --noEmit --pretty false
npm run lint
npm run test
npm run build
```

테스트 DB는 `.env.test.local`의 `DATABASE_URL`을 사용합니다. 테스트 환경 설정은 운영 DB 오작동을 막기 위해 URL에 `gym_reservation_test`가 포함되지 않으면 즉시 실패하도록 구성되어 있습니다.

주요 테스트 범위:

- 예약 생성과 lock 생성
- 중복 활성 예약 차단
- 슬롯 정원 초과 차단
- 관리자 슬롯 마감
- 관리자 슬롯 단건/일괄 변경 검증
- 예약 취소와 lock 해제
- 이용 완료 처리
- 관리자 예약 조회
- 사용자 예약 상세 조회
- 관리자 운영 요약 집계
- 관리자 시설 추가, 수정, 비활성화 정책

## 향후 개선 계획

- 관리자 시설 관리 UX 개선
- 여러 날짜 선택 기반 슬롯 일괄 관리
- 공휴일 데이터 기반 휴관일 계산
- 내 정보와 설정 화면 확장
- 카카오/네이버 로그인 검토
- 소모임 기능 검토
- 예약 알림 기능 검토
- 배포 환경용 MySQL 구성 정리
