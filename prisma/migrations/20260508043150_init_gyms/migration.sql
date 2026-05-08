-- CreateTable
CREATE TABLE `gyms` (
    `id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `region` VARCHAR(100) NOT NULL,
    `address` VARCHAR(300) NOT NULL,
    `official_url` VARCHAR(500) NOT NULL,
    `open_hours` VARCHAR(100) NOT NULL,
    `base_price` INTEGER NOT NULL,
    `description` TEXT NOT NULL,
    `distance_km` DECIMAL(5, 2) NOT NULL,
    `sport_prices` JSON NOT NULL,
    `facilities` JSON NOT NULL,
    `available_times` JSON NOT NULL,
    `closed_days` JSON NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gym_sports` (
    `gym_id` VARCHAR(64) NOT NULL,
    `sport` VARCHAR(20) NOT NULL,

    PRIMARY KEY (`gym_id`, `sport`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `gym_sports` ADD CONSTRAINT `gym_sports_gym_id_fkey` FOREIGN KEY (`gym_id`) REFERENCES `gyms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
