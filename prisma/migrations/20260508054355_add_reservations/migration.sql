-- CreateTable
CREATE TABLE `reservations` (
    `id` VARCHAR(64) NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `gym_id` VARCHAR(64) NOT NULL,
    `sport` VARCHAR(20) NOT NULL,
    `date` VARCHAR(10) NOT NULL,
    `time` VARCHAR(5) NOT NULL,
    `price` INTEGER NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `active_key` VARCHAR(255) NOT NULL,

    INDEX `idx_res_user_created`(`user_id`, `created_at` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reservation_locks` (
    `active_key` VARCHAR(255) NOT NULL,
    `reservation_id` VARCHAR(64) NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `reservation_locks_reservation_id_key`(`reservation_id`),
    PRIMARY KEY (`active_key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `reservations` ADD CONSTRAINT `reservations_gym_id_fkey` FOREIGN KEY (`gym_id`) REFERENCES `gyms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reservation_locks` ADD CONSTRAINT `reservation_locks_reservation_id_fkey` FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
