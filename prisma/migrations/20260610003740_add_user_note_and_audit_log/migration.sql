-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "admin_uid" VARCHAR(64) NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "target_type" VARCHAR(32) NOT NULL,
    "target_id" VARCHAR(128) NOT NULL,
    "summary" VARCHAR(500) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_notes" (
    "id" TEXT NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "admin_uid" VARCHAR(64) NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_audit_created" ON "audit_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_audit_target" ON "audit_logs"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "idx_user_notes_user_created" ON "user_notes"("user_id", "created_at" DESC);

-- RLS deny-default: 기존 도메인 테이블과 동일 패턴(20260526124231_enable_rls_deny_default).
-- 정책(POLICY)을 추가하지 않으므로 anon / authenticated PostgREST 직접 접근은 모두 거부된다.
-- audit_logs는 admin_uid/action/target 등 운영 이력, user_notes는 고객 메모로 둘 다 민감 정보다.
-- Prisma는 table owner / BYPASSRLS(Supabase pooler "postgres" role)로 접근하므로 영향 없다.
-- FORCE ROW LEVEL SECURITY는 추가하지 않는다(owner도 적용 대상이 되어 Prisma 트래픽이 막힘).
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_notes" ENABLE ROW LEVEL SECURITY;
