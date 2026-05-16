-- handover_nonce_payload(20260516152651)가 ADD COLUMN handover_nonce VARCHAR(128)
-- NOT NULL을 적용할 때, 기존 ticket row가 남아 있으면 NOT NULL 추가가 실패한다.
-- ticket은 5분 TTL 임시 데이터이므로 그 직전에 비워 둔다.
-- timestamp가 더 앞이라 새 환경 deploy에서 이 migration이 먼저 실행된다.
-- 빈 테이블에서는 no-op으로 통과한다.
DELETE FROM `auth_handover_tickets`;
