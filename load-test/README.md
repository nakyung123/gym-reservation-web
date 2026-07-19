# load-test

k6 기반 부하 테스트. 두 가지를 잰다.

1. **예약 생성 동시성** — 정원을 초과하는 예약이 발생하지 않는지 (정합성)
2. **관리자 조회 성능** — 예약 인덱스 유무에 따른 응답시간 (성능)

측정 대상은 **로컬 프로덕션 빌드**다. 운영(Vercel/Supabase)에는 절대 실행하지 않는다.
운영에 부하를 걸면 비용이 발생하고 rate limit에 막혀 측정도 되지 않는다.

## 사전 준비

k6는 저장소에 포함하지 않는다. https://k6.io/docs/get-started/installation/ 에서 설치하거나
standalone 바이너리를 받아 `K6` 환경변수로 경로를 지정한다.

```bash
# 로컬 DB가 떠 있어야 한다
docker compose up -d

# 프로덕션 빌드 후 3100 포트로 기동.
# SLACK_WEBHOOK_URL을 비워 테스트 예약이 실제 Slack에 알림을 보내지 않게 한다.
npm run build
SLACK_WEBHOOK_URL= npx next start -p 3100
```

## 1. 예약 생성 동시성

정원 10팀 슬롯에 서로 다른 사용자 200명이 동시에 예약을 시도한다.
기대 결과는 **성공 10건 / 마감 190건 / 그 외 0건**이다.

```bash
# ① 테스트 사용자 200명 + 관리자 1명의 Firebase ID 토큰 발급
#    → load-test/tokens.json 생성 (gitignore됨, 유효 1시간)
npx dotenv -e .env.local -- node load-test/setup/mint-tokens.mjs mint

# ② 대상 슬롯을 capacity=10, reservedCount=0으로 초기화
#    → 출력된 JSON을 load-test/target.json으로 저장
npx dotenv -e .env.local -- node load-test/setup/slot.mjs prepare > load-test/target.json

# ③ 실행
BASE=http://localhost:3100 k6 run load-test/booking-race.js

# ④ DB 정합성 검증 — HTTP 응답이 아니라 실제 DB 상태를 본다
npx dotenv -e .env.local -- node load-test/setup/slot.mjs verify
```

`verify`가 확인하는 불변식:

| 항목 | 기대 |
|---|---|
| `reservedCount` | `capacity`와 같거나 작음 |
| `actualReservations` | `reservedCount`와 일치 (카운터만 오르는 상황 배제) |
| `uniqueUsers` | 예약 수와 일치 (한 사람이 두 자리 차지 배제) |
| `uniqueActiveKeys` | 예약 수와 일치 (중복 예약 배제) |

## 2. 관리자 조회 성능 (인덱스 on/off)

데이터가 적으면 플래너가 인덱스를 쓰지 않으므로 **먼저 증량해야 한다.**

```bash
# ① 예약 12만건 생성 (id prefix k6seed-)
npx dotenv -e .env.local -- node load-test/setup/seed-bulk.mjs seed 120000

# ② 인덱스 있는 상태로 측정
npx dotenv -e .env.local -- node load-test/setup/index-toggle.mjs on
BASE=http://localhost:3100 k6 run load-test/admin-read.js

# ③ 인덱스 없는 상태로 측정
npx dotenv -e .env.local -- node load-test/setup/index-toggle.mjs off
BASE=http://localhost:3100 k6 run load-test/admin-read.js

# ④ DB 계층만 따로 측정 (EXPLAIN ANALYZE) — HTTP 오버헤드 제외
npx dotenv -e .env.local -- node load-test/setup/db-timing.mjs

# ⑤ 인덱스 원복 (필수)
npx dotenv -e .env.local -- node load-test/setup/index-toggle.mjs on
```

`index-toggle.mjs`는 대상 DB 이름에 `dev`가 없으면 실행을 거부한다(운영 오조작 방지).

### HTTP만 재면 안 되는 이유

관리자 엔드포인트는 요청마다 `verifyIdToken(idToken, true)`로 Firebase에
**revoked 검사 네트워크 왕복**을 한다(`admin-auth.ts`, 권한 회수 즉시 반영을 위한 의도된 선택).
이 비용이 응답시간의 대부분을 차지해서, DB 쿼리가 아무리 빨라져도 HTTP 개선폭은 작게 보인다.
그래서 `db-timing.mjs`로 DB 계층을 분리해 함께 봐야 한다.

### rate limit

관리자 API는 IP당 60회/분 제한이 있다. `admin-read.js`는 반복마다 다른
`X-Forwarded-For`를 보내 개별 클라이언트를 시뮬레이션한다(실제 부하도 여러 IP에서 온다).
이게 통한다는 것은 `extractClientIp`가 XFF를 검증 없이 신뢰한다는 뜻이기도 하다.
Vercel 뒤에서는 플랫폼이 XFF를 세팅하므로 운영에서는 대체로 안전하지만,
앱에 직접 도달하는 경로가 생기면 rate limit이 무력화될 수 있다.

## 정리 (반드시 실행)

테스트는 실제 Firebase 사용자와 DB 행을 만든다. 끝나면 회수한다.

```bash
npx dotenv -e .env.local -- node load-test/setup/seed-bulk.mjs clean    # 증량 예약 삭제
npx dotenv -e .env.local -- node load-test/setup/slot.mjs clean         # 테스트 예약·슬롯 복구
npx dotenv -e .env.local -- node load-test/setup/mint-tokens.mjs clean  # Firebase 사용자 삭제
npx dotenv -e .env.local -- node load-test/setup/index-toggle.mjs on    # 인덱스 원복
rm load-test/tokens.json load-test/target.json
```
