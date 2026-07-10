-- CreateTable
CREATE TABLE "admin_access_logs" (
    "id" TEXT NOT NULL,
    "admin_uid" VARCHAR(64) NOT NULL,
    "ip" VARCHAR(64) NOT NULL,
    "user_agent" VARCHAR(256) NOT NULL,
    "path" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_admin_access_created" ON "admin_access_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_admin_access_admin" ON "admin_access_logs"("admin_uid");
