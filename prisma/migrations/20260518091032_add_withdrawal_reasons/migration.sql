CREATE TABLE `withdrawal_reasons` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `category` VARCHAR(32) NOT NULL,
    `detail` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_withdrawal_created`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
