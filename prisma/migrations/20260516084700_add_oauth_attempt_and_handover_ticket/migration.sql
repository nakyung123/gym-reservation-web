-- CreateTable
CREATE TABLE `oauth_attempts` (
    `attempt_id` VARCHAR(64) NOT NULL,
    `anon_uid` VARCHAR(64) NOT NULL,
    `provider` VARCHAR(16) NOT NULL,
    `state` VARCHAR(128) NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,

    INDEX `idx_oauth_attempt_expires`(`expires_at`),
    PRIMARY KEY (`attempt_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auth_handover_tickets` (
    `ticket_id` VARCHAR(64) NOT NULL,
    `anon_uid` VARCHAR(64) NOT NULL,
    `target_uid` VARCHAR(64) NOT NULL,
    `provider` VARCHAR(16) NOT NULL,
    `needs_transfer` BOOLEAN NOT NULL,
    `confirm_required` BOOLEAN NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `finalize_attempt_count` INTEGER NOT NULL DEFAULT 0,
    `last_finalize_error` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,

    INDEX `idx_auth_ticket_expires`(`expires_at`),
    PRIMARY KEY (`ticket_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
