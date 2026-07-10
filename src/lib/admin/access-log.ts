// 관리자 접속 기록(access log)의 공유 타입.
// 기록 측(API 라우트)과 조회 측(admin UI)이 같은 도메인 형태를 공유하는 SSOT다.
// 서버 전용 의존이 없으므로 클라이언트 번들에도 안전하게 포함될 수 있다.

// 컬럼 상한(schema.prisma의 VarChar와 일치). 기록 측에서 절단 기준으로 재사용한다.
export const ADMIN_ACCESS_IP_MAX = 64;
export const ADMIN_ACCESS_USER_AGENT_MAX = 256;
export const ADMIN_ACCESS_PATH_MAX = 128;

// API/JSON 경계를 건너는 도메인 형태. createdAt은 ISO 문자열(도메인 날짜 컨벤션과 동일).
export type AdminAccessLogEntry = {
  id: string;
  adminUid: string;
  ip: string;
  userAgent: string;
  path: string;
  createdAt: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isAdminAccessLogEntry(
  value: unknown,
): value is AdminAccessLogEntry {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.adminUid === "string" &&
    typeof value.ip === "string" &&
    typeof value.userAgent === "string" &&
    typeof value.path === "string" &&
    typeof value.createdAt === "string"
  );
}
