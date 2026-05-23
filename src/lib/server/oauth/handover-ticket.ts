import "server-only";
import { prisma } from "@/lib/server/prisma-client";
import { generateOpaqueToken } from "@/lib/server/oauth/oauth-state";

// callback이 발급해 클라이언트 handover 흐름을 control하는 1회용 ticket.
// 상태 머신: pending → token_issued → signed_in → finalized.
//   pending      : callback 완료, customToken 미발급
//   token_issued : /token이 nonce 검증 후 customToken 발급
//   signed_in    : 클라이언트가 targetUid ID token으로 /finalize 도달
//   finalized    : /finalize 처리 완료(profile sync 등)
// handoverNonce는 HttpOnly cookie와 1:1 매칭되는 bearer 보강 값이다.
// 익명 흐름 제거 후 anonUid/migration이 사라져 finalize는 단순화됨.
// profilePayload는 provider profile snapshot으로, finalize에서 admin.updateUser에
// 사용된다. access/refresh token류는 저장하지 않는다.

export const HANDOVER_TICKET_TTL_MS = 5 * 60 * 1000;
export const MAX_FINALIZE_ATTEMPTS = 5;

export type TicketStatus =
  | "pending"
  | "token_issued"
  | "signed_in"
  | "finalized";

export type HandoverProfilePayload = {
  email?: string | null;
  nickname?: string | null;
  photoUrl?: string | null;
};

export type HandoverTicketRecord = {
  ticketId: string;
  targetUid: string;
  provider: string;
  handoverNonce: string;
  profilePayload: HandoverProfilePayload | null;
  status: TicketStatus;
  finalizeAttemptCount: number;
  lastFinalizeError: string | null;
  createdAt: Date;
  expiresAt: Date;
};

export async function createTicket(input: {
  targetUid: string;
  provider: "kakao" | "naver";
  handoverNonce: string;
  profilePayload: HandoverProfilePayload | null;
}): Promise<HandoverTicketRecord> {
  await cleanupExpiredTickets();

  const ticketId = generateOpaqueToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + HANDOVER_TICKET_TTL_MS);

  const created = await prisma.authHandoverTicket.create({
    data: {
      ticketId,
      targetUid: input.targetUid,
      provider: input.provider,
      handoverNonce: input.handoverNonce,
      profilePayload: input.profilePayload ?? undefined,
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
      found.status === "finalized"
    ) {
      return toRecord(found);
    }
    return null;
  });
}

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
    if (found.status === "signed_in" || found.status === "finalized") {
      return toRecord(found);
    }
    return null;
  });
}

// signed_in → finalized. 최종 마감. 이미 finalized면 그대로 반환(idempotent).
export async function markFinalized(
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
        data: { status: "finalized", lastFinalizeError: null },
      });
      return toRecord(updated);
    }
    if (found.status === "finalized") {
      return toRecord(found);
    }
    return null;
  });
}

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
  } catch {
    console.error("[handover-ticket] cleanup failed");
  }
}

function toRecord(row: {
  ticketId: string;
  targetUid: string;
  provider: string;
  handoverNonce: string;
  profilePayload: unknown;
  status: string;
  finalizeAttemptCount: number;
  lastFinalizeError: string | null;
  createdAt: Date;
  expiresAt: Date;
}): HandoverTicketRecord {
  return {
    ticketId: row.ticketId,
    targetUid: row.targetUid,
    provider: row.provider,
    handoverNonce: row.handoverNonce,
    profilePayload: normalizeProfilePayload(row.profilePayload),
    status: row.status as TicketStatus,
    finalizeAttemptCount: row.finalizeAttemptCount,
    lastFinalizeError: row.lastFinalizeError,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

function normalizeProfilePayload(
  value: unknown,
): HandoverProfilePayload | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  const result: HandoverProfilePayload = {};
  if (typeof obj.email === "string") result.email = obj.email;
  if (typeof obj.nickname === "string") result.nickname = obj.nickname;
  if (typeof obj.photoUrl === "string") result.photoUrl = obj.photoUrl;
  return result;
}
