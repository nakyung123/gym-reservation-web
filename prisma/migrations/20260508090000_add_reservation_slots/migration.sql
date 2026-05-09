-- CreateTable
CREATE TABLE `reservation_slots` (
    `gym_id` VARCHAR(64) NOT NULL,
    `sport` VARCHAR(20) NOT NULL,
    `date` VARCHAR(10) NOT NULL,
    `time` VARCHAR(5) NOT NULL,
    `capacity` INTEGER NOT NULL,
    `reserved_count` INTEGER NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_res_slots_gym_date`(`gym_id`, `date`),
    PRIMARY KEY (`gym_id`, `sport`, `date`, `time`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `reservation_slots` ADD CONSTRAINT `reservation_slots_gym_id_fkey` FOREIGN KEY (`gym_id`) REFERENCES `gyms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
