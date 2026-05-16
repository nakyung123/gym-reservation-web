/*
  Warnings:

  - You are about to drop the column `confirm_required` on the `auth_handover_tickets` table. All the data in the column will be lost.
  - You are about to drop the column `needs_transfer` on the `auth_handover_tickets` table. All the data in the column will be lost.
  - Added the required column `handover_nonce` to the `auth_handover_tickets` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `auth_handover_tickets` DROP COLUMN `confirm_required`,
    DROP COLUMN `needs_transfer`,
    ADD COLUMN `handover_nonce` VARCHAR(128) NOT NULL,
    ADD COLUMN `profile_payload` JSON NULL;
