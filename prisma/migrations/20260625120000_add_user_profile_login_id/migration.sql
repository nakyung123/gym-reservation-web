-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN     "login_id" VARCHAR(20);

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_login_id_key" ON "user_profiles"("login_id");
