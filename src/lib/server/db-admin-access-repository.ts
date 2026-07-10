import "server-only";
import type { AdminAccessLog } from "@prisma/client";
import {
  ADMIN_ACCESS_IP_MAX,
  ADMIN_ACCESS_PATH_MAX,
  ADMIN_ACCESS_USER_AGENT_MAX,
  type AdminAccessLogEntry,
} from "@/lib/admin/access-log";
import { prisma } from "@/lib/server/prisma-client";

// 관리자 콘솔 접속 기록 저장소.
//
// 정책:
// - 기록은 best-effort다. 접속 insert 실패가 콘솔 진입을 막지 않도록
//   호출 측은 safeRecordAdminAccess로 호출해 실패를 격리한다.
// - adminUid는 검증된 Firebase uid만 넘어온다(라우트에서 verifyAdminToken 통과분).
// - 문자열은 컬럼 상한에 맞춰 절단한다(초과 입력으로 insert가 깨지지 않게).

export type RecordAdminAccessInput = {
  adminUid: string;
  ip: string;
  userAgent: string;
  path: string;
};

export type ListAdminAccessInput = {
  adminUid?: string;
  limit?: number;
};

const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 200;

function toDomain(row: AdminAccessLog): AdminAccessLogEntry {
  return {
    id: row.id,
    adminUid: row.adminUid,
    ip: row.ip,
    userAgent: row.userAgent,
    path: row.path,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function recordAdminAccess(
  input: RecordAdminAccessInput,
): Promise<AdminAccessLogEntry> {
  const row = await prisma.adminAccessLog.create({
    data: {
      adminUid: input.adminUid.slice(0, ADMIN_ACCESS_IP_MAX),
      ip: input.ip.slice(0, ADMIN_ACCESS_IP_MAX),
      userAgent: input.userAgent.slice(0, ADMIN_ACCESS_USER_AGENT_MAX),
      path: input.path.slice(0, ADMIN_ACCESS_PATH_MAX),
    },
  });

  return toDomain(row);
}

// 라우트에서 쓰는 비파괴 wrapper. 실패해도 throw하지 않고 stderr에만 남긴다.
// 로그에는 adminUid 식별자만 남기고 ip/userAgent 원문은 남기지 않는다.
export async function safeRecordAdminAccess(
  input: RecordAdminAccessInput,
): Promise<void> {
  try {
    await recordAdminAccess(input);
  } catch (error) {
    console.error(`[admin-access] 기록 실패 admin=${input.adminUid}`, error);
  }
}

export async function listAdminAccessLogs(
  input: ListAdminAccessInput = {},
): Promise<AdminAccessLogEntry[]> {
  const limit = Math.min(input.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);

  const rows = await prisma.adminAccessLog.findMany({
    where: input.adminUid ? { adminUid: input.adminUid } : {},
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map(toDomain);
}
