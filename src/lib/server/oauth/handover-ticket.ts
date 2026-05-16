import "server-only";
import { prisma } from "@/lib/server/prisma-client";
import { generateOpaqueToken } from "@/lib/server/oauth/oauth-state";

// callback이 발급해 클라이언트 handover 흐름을 control하는 1회용 ticket.
// 상태 머신: pending → token_issued → signed_in → transferred.
//   pending      : callback 완료, customToken 미발급
//   token_issued : /token이 customToken을 발급
//   signed_in    : 클라이언트가 targetUid ID token으로 /finalize 도달
//   transferred  : migration 완료 또는 프로필 동기화 완료(기존 가입 케이스)
// finalize 실패는 lastFinalizeError에 기록하고 finalizeAttemptCount를 늘려
// 같은 ticket으로 TTL 내 재시도를 허용한다.

export const HANDOVER_TICKET_TTL_MS = 5 * 60 * 1000;
export const MAX_FINALIZE_ATTEMPTS = 5;

export type TicketStatus =
  | "pending"
  | "token_issued"
  | "signed_in"
  | "transferred";

export type HandoverTicketRecord = {
  ticketId: string;
  anonUid: string;
  targetUid: string;
  provider: string;
  needsTransfer: boolean;
  confirmRequired: boolean;
  status: TicketStatus;
  finalizeAttemptCount: number;
  lastFinalizeError: string | null;
  createdAt: Date;
  expiresAt: Date;
};

export async function createTicket(input: {
  anonUid: string;
  targetUid: string;
  provider: "kakao" | "naver";
  needsTransfer: boolean;
  confirmRequired: boolean;
}): Promise<HandoverTicketRecord> {
  await cleanupExpiredTickets();

  const ticketId = generateOpaqueToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + HANDOVER_TICKET_TTL_MS);

  const created = await prisma.authHandoverTicket.create({
    data: {
      ticketId,
      anonUid: input.anonUid,
      targetUid: input.targetUid,
      provider: input.provider,
      needsTransfer: input.needsTransfer,
      confirmRequired: input.confirmRequired,
      status: "pending",
      finalizeAttemptCount: 0,
      lastFinalizeError: null,
      createdAt: now,
      expiresAt,
    },
  });

  return toRecord(created);
}

export async function findActiveTicket(
  ticketId: string,
): Promise<HandoverTicketRecord | null> {
  await cleanupExpiredTickets();
  const found = await prisma.authHandoverTicket.findUnique({
    where: { ticketId },
  });
  if (!found) return null;
  if (found.expiresAt.getTime() < Date.now()) return null;
  return toRecord(found);
}

// pending → token_issued. 이미 token_issued 이상이면 그대로 반환(idempotent).
// 만료/없음이면 null.
export async function markTokenIssued(
  ticketId: string,
): Promise<HandoverTicketRecord | null> {
  return prisma.$transaction(async (tx) => {
    const found = await tx.authHandoverTicket.findUnique({
      where: { ticketId },
    });
    if (!found) return null;
    if (found.expiresAt.getTime() < Date.now()) return null;
    if (found.status === "pending") {
      const updated = await tx.authHandoverTicket.update({
        where: { ticketId },
        data: { status: "token_issued" },
      });
      return toRecord(updated);
    }
    if (
      found.status === "token_issued" ||
      found.status === "signed_in" ||
      found.status === "transferred"
    ) {
      return toRecord(found);
    }
    return null;
  });
}

// token_issued → signed_in. 이미 signed_in/transferred면 그대로 반환.
// pending 상태에서는 호출 금지(흐름 위반) → null.
export async function markSignedIn(
  ticketId: string,
): Promise<HandoverTicketRecord | null> {
  return prisma.$transaction(async (tx) => {
    const found = await tx.authHandoverTicket.findUnique({
      where: { ticketId },
    });
    if (!found) return null;
    if (found.expiresAt.getTime() < Date.now()) return null;
    if (found.status === "token_issued") {
      const updated = await tx.authHandoverTicket.update({
        where: { ticketId },
        data: { status: "signed_in" },
      });
      return toRecord(updated);
    }
    if (found.status === "signed_in" || found.status === "transferred") {
      return toRecord(found);
    }
    return null;
  });
}

// signed_in → transferred. 최종 마감. 이미 transferred면 그대로 반환.
export async function markTransferred(
  ticketId: string,
): Promise<HandoverTicketRecord | null> {
  return prisma.$transaction(async (tx) => {
    const found = await tx.authHandoverTicket.findUnique({
      where: { ticketId },
    });
    if (!found) return null;
    if (found.expiresAt.getTime() < Date.now()) return null;
    if (found.status === "signed_in") {
      const updated = await tx.authHandoverTicket.update({
        where: { ticketId },
        data: { status: "transferred", lastFinalizeError: null },
      });
      return toRecord(updated);
    }
    if (found.status === "transferred") {
      return toRecord(found);
    }
    return null;
  });
}

// finalize 실패 시 호출. attempt count를 증가하고 마지막 에러 메시지를 기록한다.
// MAX_FINALIZE_ATTEMPTS 초과 여부는 호출자가 결정한다.
export async function recordFinalizeFailure(
  ticketId: string,
  errorMessage: string,
): Promise<number> {
  const trimmed = errorMessage.slice(0, 500);
  const updated = await prisma.authHandoverTicket.update({
    where: { ticketId },
    data: {
      finalizeAttemptCount: { increment: 1 },
      lastFinalizeError: trimmed,
    },
  });
  return updated.finalizeAttemptCount;
}

async function cleanupExpiredTickets(): Promise<void> {
  try {
    await prisma.authHandoverTicket.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  } catch (error) {
    console.error("[handover-ticket] cleanup failed:", error);
  }
}

function toRecord(row: {
  ticketId: string;
  anonUid: string;
  targetUid: string;
  provider: string;
  needsTransfer: boolean;
  confirmRequired: boolean;
  status: string;
  finalizeAttemptCount: number;
  lastFinalizeError: string | null;
  createdAt: Date;
  expiresAt: Date;
}): HandoverTicketRecord {
  return {
    ...row,
    status: row.status as TicketStatus,
  };
}
