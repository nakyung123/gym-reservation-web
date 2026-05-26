-- CreateTable
CREATE TABLE "rate_limit_buckets" (
    "scope" VARCHAR(64) NOT NULL,
    "identifier_hash" VARCHAR(64) NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("scope","identifier_hash","window_start")
);

-- CreateIndex
CREATE INDEX "idx_rate_limit_expires" ON "rate_limit_buckets"("expires_at");

-- RLS deny-default: 다른 도메인 테이블과 동일 패턴.
-- anon / authenticated PostgREST 직접 접근 차단. Prisma는 owner라 영향 없음.
-- identifier_hash가 IP/email/uid 추론에 활용될 수 있으므로 신규 테이블 추가 시점에 RLS도 함께 켠다.
ALTER TABLE "rate_limit_buckets" ENABLE ROW LEVEL SECURITY;
