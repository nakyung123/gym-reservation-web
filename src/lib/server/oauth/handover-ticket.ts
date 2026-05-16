import "server-only";
import { prisma } from "@/lib/server/prisma-client";
import { generateOpaqueToken } from "@/lib/server/oauth/oauth-state";

// callback이 발급해 클라이언트 handover 흐름을 control하는 1회용 ticket.
// 상태 머신: pending → token_issued → signed_in → transferred.
//   pending      : callback 완료, customToken 미발급
//   token_issued : /token이 nonce 검증 후 customToken을 발급
//   signed_in    : 클라이언트가 targetUid ID token으로 /finalize 도달
//   transferred  : finalize transaction 완료(migration 또는 기존 계정 로그인)
// handoverNonce는 HttpOnly cookie에 함께 저장되어 ticket bearer를 보강한다.
// 신규/기존 판정은 ticket에 저장하지 않고 /finalize transaction 안에서
// targetUid의 실제 앱 데이터로 결정한다.
// profilePayload는 provider profile snapshot으로, finalize 성공 후
// admin.updateUser에 사용된다. access/refresh token류는 저장하지 않는다.
// finalize 실패는 lastFinalizeError에 기록하고 finalizeAttemptCount를 늘려
// 같은 ticket으로 TTL 내 재시도를 허용한다.

export const HANDOVER_TICKET_TTL_MS = 5 * 60 * 1000;
export const MAX_FINALIZE_ATTEMPTS = 5;

export type TicketStatus =
  | "pending"
  | "token_issued"
  | "signed_in"
  | "transferred";

// transferred로 마감될 때 결정된 분기 결과.
//   "migrated" : 신규 가입 + anon 데이터를 targetUid로 이전
//   "linked"   : 기존 가입에 단순 로그인(anon 데이터는 이전하지 않음)
// 동일 ticket을 재호출(idempotent)할 때 정확한 transferred bool 응답에 사용한다.
export type TicketOutcome = "migrated" | "linked";

// provider profile snapshot. callback이 정규화해 ticket에 저장하고,
// finalize 성공 후 admin.updateUser에 그대로 전달한다.
export type HandoverProfilePayload = {
  email?: string | null;
  nickname?: string | null;
  photoUrl?: string | null;
};

export type HandoverTicketRecord = {
  ticketId: string;
  anonUid: string;
  targetUid: string;
  provider: string;
  handoverNonce: string;
  profilePayload: HandoverProfilePayload | null;
  status: TicketStatus;
  outcome: TicketOutcome | null;
  finalizeAttemptCount: number;
  lastFinalizeError: string | null;
  createdAt: Date;
  expiresAt: Date;
};

export async function createTicket(input: {
  anonUid: string;
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
      anonUid: input.anonUid,
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

// signed_in → transferred. 최종 마감. outcome으로 신규/기존 분기 결과를 함께 저장한다.
// 이미 transferred면 outcome을 덮어쓰지 않고 그대로 반환(idempotent).
export async function markTransferred(
  ticketId: string,
  outcome: TicketOutcome,
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
        data: { status: "transferred", outcome, lastFinalizeError: null },
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
  handoverNonce: string;
  profilePayload: unknown;
  status: string;
  outcome: string | null;
  finalizeAttemptCount: number;
  lastFinalizeError: string | null;
  createdAt: Date;
  expiresAt: Date;
}): HandoverTicketRecord {
  return {
    ticketId: row.ticketId,
    anonUid: row.anonUid,
    targetUid: row.targetUid,
    provider: row.provider,
    handoverNonce: row.handoverNonce,
    profilePayload: normalizeProfilePayload(row.profilePayload),
    status: row.status as TicketStatus,
    outcome: normalizeOutcome(row.outcome),
    finalizeAttemptCount: row.finalizeAttemptCount,
    lastFinalizeError: row.lastFinalizeError,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

function normalizeOutcome(value: string | null): TicketOutcome | null {
  if (value === "migrated" || value === "linked") return value;
  return null;
}

// Prisma Json 컬럼은 unknown으로 들어오므로 안전하게 좁힌다.
// 알려진 키만 추출하고 string/null만 허용한다.
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
