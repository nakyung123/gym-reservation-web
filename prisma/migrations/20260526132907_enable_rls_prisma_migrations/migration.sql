-- Prisma 메타 테이블 `_prisma_migrations`에도 RLS를 활성화한다.
-- 도메인 테이블 RLS(20260526124231_enable_rls_deny_default)와 같은 deny default 패턴.
-- 정책(POLICY)을 추가하지 않으므로 anon / authenticated PostgREST는 모든 row 거부.
--
-- 노출 데이터는 migration_name / started_at / finished_at / checksum 정도라 비밀/PII는
-- 아니지만, schema 진화 이력이 anon에 노출되면 약한 정보 누출이 된다.
-- Supabase Advisor가 critical "RLS Disabled in Public"으로 잡는 항목이다.
--
-- 주의: `prisma migrate dev`는 빈 shadow database에서 migration을 검증하는데,
-- shadow DB에는 `_prisma_migrations` 테이블이 아직 만들어지기 전이므로 단순
-- `ALTER TABLE`은 P1014로 실패한다. 그래서 pg_tables 존재 여부 체크로 감싸
-- shadow DB에서는 no-op, 실제 DB(dev/test/prod)에서는 정상 적용되게 한다.
--
-- Prisma는 table owner / BYPASSRLS 권한으로 직접 접근하므로 RLS 활성화 후에도
-- migrate / generate / deploy 흐름은 정상 동작한다. FORCE ROW LEVEL SECURITY는
-- 추가하지 않는다 (owner도 적용 대상이 되어 Prisma 트래픽 전체가 차단됨).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename = '_prisma_migrations'
  ) THEN
    EXECUTE 'ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;
