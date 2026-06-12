import { describe, expect, it } from "vitest";
import {
  createTicket,
  findActiveTicket,
  markTokenIssued,
  markSignedIn,
  markFinalized,
  recordFinalizeFailure,
  HANDOVER_TICKET_TTL_MS,
} from "@/lib/server/oauth/handover-ticket";
import { prisma } from "@/lib/server/prisma-client";

async function makeTicket(overrides?: {
  handoverNonce?: string;
  profilePayload?: { email?: string | null } | null;
}) {
  return createTicket({
    targetUid: "kakao:1",
    provider: "kakao",
    handoverNonce: overrides?.handoverNonce ?? "nonce-test-value",
    profilePayload: overrides?.profilePayload ?? null,
  });
}

describe("handover ticket store", () => {
  it("createTicket이 pending 상태로 ticket을 발급한다", async () => {
    const before = Date.now();
    const ticket = await makeTicket();
    expect(ticket.ticketId).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(ticket.status).toBe("pending");
    expect(ticket.handoverNonce).toBe("nonce-test-value");
    expect(ticket.profilePayload).toBeNull();
    expect(ticket.finalizeAttemptCount).toBe(0);
    expect(ticket.lastFinalizeError).toBeNull();
    expect(ticket.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + HANDOVER_TICKET_TTL_MS - 1000,
    );
  });

  it("createTicket이 profilePayload(email)를 저장하고 findActiveTicket으로 다시 읽는다", async () => {
    const payload = { email: "a@b" };
    const ticket = await makeTicket({ profilePayload: payload });
    const found = await findActiveTicket(ticket.ticketId);
    expect(found?.profilePayload).toEqual(payload);
  });

  it("findActiveTicket은 만료 전 ticket을 반환하고 만료 후엔 null을 반환한다", async () => {
    const ticket = await makeTicket();
    const found = await findActiveTicket(ticket.ticketId);
    expect(found?.ticketId).toBe(ticket.ticketId);

    await prisma.authHandoverTicket.update({
      where: { ticketId: ticket.ticketId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await findActiveTicket(ticket.ticketId);
    expect(expired).toBeNull();
  });

  it("상태 머신은 pending → token_issued → signed_in → finalized 순서로 진행된다", async () => {
    const { ticketId } = await makeTicket();

    const issued = await markTokenIssued(ticketId);
    expect(issued?.status).toBe("token_issued");

    const signedIn = await markSignedIn(ticketId);
    expect(signedIn?.status).toBe("signed_in");

    const finalized = await markFinalized(ticketId);
    expect(finalized?.status).toBe("finalized");
  });

  it("markTokenIssued는 이미 token_issued/signed_in/finalized인 경우 그대로 반환한다 (idempotent)", async () => {
    const { ticketId } = await makeTicket();
    await markTokenIssued(ticketId);

    const again = await markTokenIssued(ticketId);
    expect(again?.status).toBe("token_issued");

    await markSignedIn(ticketId);
    const stillOk = await markTokenIssued(ticketId);
    expect(stillOk?.status).toBe("signed_in");
  });

  it("markSignedIn은 pending 상태에서는 null을 반환한다 (흐름 위반 방지)", async () => {
    const { ticketId } = await makeTicket();
    const result = await markSignedIn(ticketId);
    expect(result).toBeNull();
  });

  it("markFinalized는 token_issued 상태에서는 null을 반환한다", async () => {
    const { ticketId } = await makeTicket();
    await markTokenIssued(ticketId);
    const result = await markFinalized(ticketId);
    expect(result).toBeNull();
  });

  it("markFinalized는 이미 finalized인 경우 idempotent하게 그대로 반환한다", async () => {
    const { ticketId } = await makeTicket();
    await markTokenIssued(ticketId);
    await markSignedIn(ticketId);
    await markFinalized(ticketId);
    const again = await markFinalized(ticketId);
    expect(again?.status).toBe("finalized");
  });

  it("recordFinalizeFailure는 attempt count를 증가시키고 lastFinalizeError를 기록한다", async () => {
    const { ticketId } = await makeTicket();
    await markTokenIssued(ticketId);
    await markSignedIn(ticketId);

    const first = await recordFinalizeFailure(ticketId, "예약 충돌");
    expect(first).toBe(1);

    const second = await recordFinalizeFailure(ticketId, "다시 충돌");
    expect(second).toBe(2);

    const stored = await prisma.authHandoverTicket.findUnique({
      where: { ticketId },
    });
    expect(stored?.lastFinalizeError).toBe("다시 충돌");
    expect(stored?.status).toBe("signed_in");
  });

  it("markFinalized 성공 시 lastFinalizeError가 null로 리셋된다", async () => {
    const { ticketId } = await makeTicket();
    await markTokenIssued(ticketId);
    await markSignedIn(ticketId);
    await recordFinalizeFailure(ticketId, "이전 실패");
    await markFinalized(ticketId);

    const stored = await prisma.authHandoverTicket.findUnique({
      where: { ticketId },
    });
    expect(stored?.lastFinalizeError).toBeNull();
    expect(stored?.status).toBe("finalized");
  });

  it("만료된 ticket의 transition은 null을 반환한다", async () => {
    const { ticketId } = await makeTicket();
    await prisma.authHandoverTicket.update({
      where: { ticketId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await markTokenIssued(ticketId)).toBeNull();
    expect(await markSignedIn(ticketId)).toBeNull();
    expect(await markFinalized(ticketId)).toBeNull();
  });
});
