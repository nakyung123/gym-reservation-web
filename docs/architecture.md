# 아키텍처

## 렌더링 전략

사용자 화면은 Next.js Server Component에서 체육관 데이터를 조회해 초기 렌더링에 필요한 클라이언트 JavaScript를 줄인다. 예약·즐겨찾기처럼 사용자 세션이 필요한 기능은 Client Component와 API Route Handler를 통해 처리한다.

`/gyms/[id]`, `/reserve/[gymId]`는 현재 활성 체육관 목록을 기준으로 정적 경로를 생성한다. 공지 상세는 조회수를 진입마다 증가시켜야 해서 `force-dynamic` + `prefetch={false}`로 둔다.

## 계층 구성

```text
Client UI
  ├─ Firebase Auth + App Check (이메일 / Google / 카카오 / 네이버)
  ├─ 사용자 예약·즐겨찾기·프로필·문의·탈퇴 API 호출
  ├─ FAQ 안내봇 위젯 (스트리밍, 루트 레이아웃 상주)
  └─ 관리자 API 호출 (Firebase ID token 첨부)

Next.js Route Handler
  ├─ Firebase ID token 검증 (Firebase Admin)
  ├─ 관리자 custom claim admin=true 검증 (+ revoked 토큰 검사)
  ├─ OAuth / admin API / FAQ 챗봇 rate limit
  └─ 도메인 서비스 호출

Repository / Service
  ├─ 예약 규칙 검증 (중복 판정, 취소 기한)
  ├─ 중복 활성 예약 방지 (reservation_locks UNIQUE)
  ├─ 슬롯 정원 조건부 UPDATE
  ├─ 회원 탈퇴 multi-step (idempotent retry)
  └─ Prisma transaction

외부 연동
  ├─ Anthropic Claude API (FAQ 안내봇 / 일일 AI 브리핑)
  ├─ Slack Incoming Webhook (예약 생성·취소 알림, 일일 리포트)
  ├─ Google Sheets API (정산 원장 동기화)
  └─ Supabase Storage (배너 이미지)

Postgres (Supabase 운영 / Docker dev)
  ├─ gyms / gym_sports
  ├─ favorites
  ├─ reservations / reservation_locks / reservation_slots
  ├─ user_profiles / user_notes
  ├─ inquiries / voc_posts
  ├─ banners / notice_views
  ├─ audit_logs / admin_access_logs
  ├─ withdrawal_reasons (익명 사유 통계)
  ├─ oauth_attempts / auth_handover_tickets (카카오·네이버 흐름)
  └─ rate_limit_buckets (DB 기반 rate limit)
```

## 데이터 소스 provider

데이터 소스는 repository provider에서 선택한다. 기본값은 `db`(Postgres)이며 `mock` / `local` 어댑터는 시연·dev 보조용이다. 옛 환경 변수 `NEXT_PUBLIC_*_DATA_SOURCE`는 폐기됐고, 남아 있으면 명시적으로 throw한다.

## 인증과 권한

| 대상 | 방식 |
|---|---|
| 사용자 API | Firebase ID token 검증 |
| 관리자 API (`/api/admin/*`) | Firebase ID token + custom claim `admin: true` (revoked 검사 포함) |
| 관리자 페이지 (`/admin`) | Basic Auth 1차 잠금 (별개 계층, fail-closed) |

관리자 claim은 운영자가 Firebase Admin SDK로 사전에 부여한다. 이전의 공유 시크릿 기반 `x-admin-token` / `ADMIN_API_TOKEN` 방식은 폐기됐다.

## Rate limit

OAuth 시작·callback·token·finalize 흐름, 관리자 API, 관리자 페이지, FAQ 챗봇은 DB 기반 rate limit을 통과해야 한다. 식별자는 `RATE_LIMIT_HMAC_SECRET`으로 HMAC 해시해 저장하며, 원문 IP·ticket·token 값은 저장하지 않는다.

## 보안 경계

- Supabase 운영 DB는 주요 public 테이블에 RLS를 활성화하고 정책을 두지 않는 **deny-default** 방식이다. 앱 서버의 Prisma 연결은 서버 전용 경계에서만 사용하며, 브라우저는 Supabase 클라이언트로 DB에 직접 접근하지 않는다.
- API 서버 오류는 사용자에게 generic 메시지로 응답하고, 내부 오류의 원문 message/stack은 응답에 포함하지 않는다. 서버 로그에는 오류 타입·이름·whitelist된 오류 코드처럼 안전한 진단 정보만 남긴다.
- 보안 헤더를 enforce하고 CSP는 Report-Only로 운영한다. (Firebase Auth가 `/login`·`/signup`에서 `unsafe-eval`을 사용해 전면 enforce는 인증 라우트 스코프 정책이 선행되어야 한다.)

## 국제화

`next-intl` 기반 쿠키 방식으로 URL은 유지한 채 한국어·영어를 전환한다. 서버는 `getTranslations`, 클라이언트는 `useTranslations`를 쓴다.

시설명·종목명, 서비스/룰 계층의 `result.message`, Firebase 오류 메시지, 비밀번호 정책, 탈퇴 사유 같은 **데이터성 문자열은 한국어로 유지**한다. 관리자 콘솔은 운영자 전용이라 의도적으로 국문만 제공한다.

## 자동화 파이프라인

| 트리거 | 동작 |
|---|---|
| 예약 생성·취소 | Slack 즉시 알림 (`notify-slack.ts`) |
| 매일 (Vercel Cron) | 일일 운영 리포트 집계 → AI 브리핑 부착 → Slack 전송 |
| 정산 동기화 | Google Sheets 정산 원장 갱신 (`sheets-ledger.ts`) |

AI 브리핑은 best-effort 레이어다. 실패하면 숫자 리포트로 폴백하고 전체 리포트를 막지 않는다. 자세한 설계는 [트러블슈팅 문서](troubleshooting.md#6-ai-브리핑의-pii와-인젝션-경계)를 참고한다.
