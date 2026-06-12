-- CreateTable
CREATE TABLE "banners" (
    "id" TEXT NOT NULL,
    "image_path" VARCHAR(256) NOT NULL,
    "link_url" VARCHAR(2000),
    "title" VARCHAR(200),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_banner_active_sort" ON "banners"("is_active", "sort_order");

-- RLS deny-default: 기존 도메인 테이블과 동일 패턴(20260526124231_enable_rls_deny_default).
-- 정책(POLICY)을 추가하지 않으므로 anon / authenticated PostgREST 직접 접근은 모두 거부된다.
-- 배너 이미지는 Supabase Storage 공개 버킷으로 노출하되, banners 테이블 행 접근은 Prisma(서버)만 한다.
-- Prisma는 table owner / BYPASSRLS(Supabase pooler "postgres" role)로 접근하므로 영향 없다.
-- FORCE ROW LEVEL SECURITY는 추가하지 않는다(owner도 적용 대상이 되어 Prisma 트래픽이 막힘).
ALTER TABLE "banners" ENABLE ROW LEVEL SECURITY;
