-- 컨테이너 최초 기동 시 1회 실행. dev DB(POSTGRES_DB)는 이미지가 자동 생성하므로
-- 여기서는 test DB만 추가로 만든다. 이후 변경은 컨테이너 재생성 시에만 반영됨.
CREATE DATABASE gym_reservation_test;
