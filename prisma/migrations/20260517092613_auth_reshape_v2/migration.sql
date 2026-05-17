/*
  Warnings:

  - You are about to drop the column `anon_uid` on the `auth_handover_tickets` table. All the data in the column will be lost.
  - You are about to drop the column `outcome` on the `auth_handover_tickets` table. All the data in the column will be lost.
  - You are about to drop the column `anon_uid` on the `oauth_attempts` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `auth_handover_tickets` DROP COLUMN `anon_uid`,
    DROP COLUMN `outcome`;

-- AlterTable
ALTER TABLE `oauth_attempts` DROP COLUMN `anon_uid`;

-- AlterTable
ALTER TABLE `user_profiles` ADD COLUMN `provider` VARCHAR(16) NULL;
