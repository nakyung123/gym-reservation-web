-- CreateTable
CREATE TABLE "voc_posts" (
    "id" TEXT NOT NULL,
    "category" VARCHAR(20) NOT NULL,
    "gym_id" VARCHAR(64),
    "author_name" VARCHAR(50) NOT NULL,
    "phone" VARCHAR(30),
    "email" VARCHAR(120),
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voc_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_voc_created" ON "voc_posts"("created_at" DESC);
