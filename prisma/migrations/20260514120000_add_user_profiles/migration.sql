-- CreateTable
CREATE TABLE `user_profiles` (
    `user_id` VARCHAR(64) NOT NULL,
    `nickname` VARCHAR(30) NULL,
    `preferred_region` VARCHAR(100) NULL,
    `preferred_sports` JSON NOT NULL,
    `reservation_notifications_enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
