-- CreateTable
CREATE TABLE `favorites` (
    `user_id` VARCHAR(64) NOT NULL,
    `gym_id` VARCHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_favorites_user`(`user_id`),
    PRIMARY KEY (`user_id`, `gym_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `favorites` ADD CONSTRAINT `favorites_gym_id_fkey` FOREIGN KEY (`gym_id`) REFERENCES `gyms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
