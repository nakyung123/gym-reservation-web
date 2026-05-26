-- Supabase Row Level Security를 모든 도메인 테이블에 활성화한다.
-- 정책(POLICY)은 추가하지 않으므로 anon / authenticated PostgREST 요청은 모든 row가 deny된다.
-- Postgres 기본 동작: RLS 활성 + 정책 0건 = row-level access 거부.
--
-- 응용 계층 검증은 그대로 유지된다 (Next Route Handler + Prisma + Firebase Auth).
-- Prisma 서버 연결은 table owner / BYPASSRLS 권한 (Supabase pooler "postgres" role)
-- 으로 접근하므로 이 정책의 영향을 받지 않는다.
--
-- 주의: FORCE ROW LEVEL SECURITY는 추가하지 않는다. owner도 RLS 적용 대상이 되어
-- Prisma 트래픽 전체가 차단된다.
--
-- 이 migration은 멱등이다. 운영 DB에 SQL Editor로 이미 켜둔 상태에서 deploy해도
-- ALTER TABLE ... ENABLE ROW LEVEL SECURITY는 no-op으로 끝나고
-- _prisma_migrations 테이블에 기록만 남는다.

ALTER TABLE "gyms"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gym_sports"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "favorites"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_profiles"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reservations"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reservation_locks"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reservation_slots"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "withdrawal_reasons"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "oauth_attempts"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auth_handover_tickets" ENABLE ROW LEVEL SECURITY;
