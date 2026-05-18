-- 1. 컬럼 추가 (먼저 NULL 허용으로). 기존 행은 NULL로 채워진다.
ALTER TABLE `gyms` ADD COLUMN `latitude` DOUBLE NULL;
ALTER TABLE `gyms` ADD COLUMN `longitude` DOUBLE NULL;

-- 2. 기존 10개 체육관 좌표 백필. 도로명 주소 기준 ±200m 정확도.
--    이 값은 기존 src/data/gym-coordinates.json에 있던 좌표와 동일하다.
UPDATE `gyms` SET `latitude` = 37.5810, `longitude` = 126.9700 WHERE `id` = 'jongno-culture-sports-center';
UPDATE `gyms` SET `latitude` = 37.5587, `longitude` = 127.0428 WHERE `id` = 'seongdong-community-sports-center';
UPDATE `gyms` SET `latitude` = 37.5715, `longitude` = 126.8965 WHERE `id` = 'mapo-community-sports-center';
UPDATE `gyms` SET `latitude` = 37.6045, `longitude` = 127.0420 WHERE `id` = 'seongbuk-community-sports-center';
UPDATE `gyms` SET `latitude` = 37.4892, `longitude` = 126.9692 WHERE `id` = 'sadang-sports-complex';
UPDATE `gyms` SET `latitude` = 37.5365, `longitude` = 127.0840 WHERE `id` = 'jayang-culture-sports-center';
UPDATE `gyms` SET `latitude` = 37.4665, `longitude` = 126.8966 WHERE `id` = 'geumcheon-culture-sports-center';
UPDATE `gyms` SET `latitude` = 37.6584, `longitude` = 127.0596 WHERE `id` = 'nowon-community-sports-center';
UPDATE `gyms` SET `latitude` = 37.5388, `longitude` = 127.1450 WHERE `id` = 'haegong-sports-culture-center';
UPDATE `gyms` SET `latitude` = 37.5395, `longitude` = 127.1567 WHERE `id` = 'iljasan-first-gym';

-- 3. 위 10개에 매치되지 않는 행 (예: dev/test DB의 잔여 fixture)이 있으면
--    NOT NULL ALTER가 실패한다. 서울 시청 기준 좌표를 fallback으로 채운다.
--    운영 DB에는 위 UPDATE로 모든 행이 채워지므로 이 UPDATE는 0건이 된다.
UPDATE `gyms` SET `latitude` = 37.5665, `longitude` = 126.9780 WHERE `latitude` IS NULL OR `longitude` IS NULL;

-- 4. NOT NULL로 전환. 좌표 없는 체육관 등록을 막는다.
ALTER TABLE `gyms` MODIFY COLUMN `latitude` DOUBLE NOT NULL;
ALTER TABLE `gyms` MODIFY COLUMN `longitude` DOUBLE NOT NULL;
