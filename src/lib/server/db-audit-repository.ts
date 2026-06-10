import "server-only";
import type { AuditLog, Prisma } from "@prisma/client";
import {
  type AuditAction,
  type AuditLogEntry,
  type AuditMetadata,
} from "@/lib/admin/audit-log";
import { prisma } from "@/lib/server/prisma-client";

// 관리자 운영 이력(audit log) 저장소.
//
// 정책:
// - 기록은 best-effort다. audit insert 실패가 본 mutation(예약 취소 등)을 깨지 않도록
//   라우트는 safeRecordAuditLog로 호출해 실패를 격리한다(별도 부가 기록의 실패 격리이며,
//   본 액션의 silent fallback이 아니다).
// - summary/metadata에는 PII 원문(email/이름)을 담지 않는다. 식별자(uid)·상태값·건수만.

export type AuditLogInput = {
  adminUid: string;
  action: AuditAction | string;
  targetType: string;
  targetId: string;
  summary: string;
  metadata?: AuditMetadata;
};

export type ListAuditLogsInput = {
  action?: string;
  targetType?: string;
  targetId?: string;
  adminUid?: string;
  limit?: number;
};

const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 200;

function toDomainAuditLog(row: AuditLog): AuditLogEntry {
  const metadata =
    row.metadata !== null &&
    typeof row.metadata === "object" &&
    !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : null;

  return {
    id: row.id,
    adminUid: row.adminUid,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    summary: row.summary,
    metadata,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function recordAuditLog(
  input: AuditLogInput,
): Promise<AuditLogEntry> {
  const row = await prisma.auditLog.create({
    data: {
      adminUid: input.adminUid,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      summary: input.summary,
      ...(input.metadata !== undefined
        ? { metadata: input.metadata as Prisma.InputJsonValue }
        : {}),
    },
  });

  return toDomainAuditLog(row);
}

// 라우트에서 쓰는 비파괴 wrapper. 실패해도 throw하지 않고 stderr에만 남긴다.
// 로그에는 action/target 식별자만 남기고 summary/metadata 원문은 남기지 않는다.
export async function safeRecordAuditLog(input: AuditLogInput): Promise<void> {
  try {
    await recordAuditLog(input);
  } catch (error) {
    console.error(
      `[audit] 기록 실패 action=${input.action} target=${input.targetType}:${input.targetId}`,
      error,
    );
  }
}

export async function listAuditLogs(
  input: ListAuditLogsInput = {},
): Promise<AuditLogEntry[]> {
  const limit = Math.min(input.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);

  const where: Prisma.AuditLogWhereInput = {};
  if (input.action) where.action = input.action;
  if (input.targetType) where.targetType = input.targetType;
  if (input.targetId) where.targetId = input.targetId;
  if (input.adminUid) where.adminUid = input.adminUid;

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map(toDomainAuditLog);
}
