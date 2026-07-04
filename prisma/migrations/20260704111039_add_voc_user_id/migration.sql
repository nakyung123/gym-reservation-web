-- AlterTable
ALTER TABLE "voc_posts" ADD COLUMN     "user_id" VARCHAR(128);

-- CreateIndex
CREATE INDEX "idx_voc_user_created" ON "voc_posts"("user_id", "created_at" DESC);
