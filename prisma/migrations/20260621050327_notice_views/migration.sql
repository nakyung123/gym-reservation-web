-- CreateTable
CREATE TABLE "notice_views" (
    "notice_id" VARCHAR(64) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notice_views_pkey" PRIMARY KEY ("notice_id")
);
