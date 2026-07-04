-- CreateTable
CREATE TABLE "inquiries" (
    "id" TEXT NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "gym_id" VARCHAR(64),
    "title" VARCHAR(100) NOT NULL,
    "body" TEXT NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'open',
    "answer" TEXT,
    "answered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_inquiries_user_created" ON "inquiries"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_inquiries_status_created" ON "inquiries"("status", "created_at" DESC);
