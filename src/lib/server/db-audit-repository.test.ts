import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listAuditLogs,
  recordAuditLog,
  safeRecordAuditLog,
} from "@/lib/server/db-audit-repository";
import { prisma } from "@/lib/server/prisma-client";

describe("recordAuditLog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("audit 행을 만들고 도메인 형태로 반환한다(createdAt ISO, metadata 객체)", async () => {
    const entry = await recordAuditLog({
      adminUid: "admin-1",
      action: "reservation.cancel",
      targetType: "reservation",
      targetId: "res-1",
      summary: "예약 취소 처리",
      metadata: { gymId: "gym-1", toStatus: "cancelled" },
    });

    expect(entry).toMatchObject({
      adminUid: "admin-1",
      action: "reservation.cancel",
      targetType: "reservation",
      targetId: "res-1",
      summary: "예약 취소 처리",
      metadata: { gymId: "gym-1", toStatus: "cancelled" },
    });
    expect(typeof entry.id).toBe("string");
    expect(() => new Date(entry.createdAt).toISOString()).not.toThrow();
    expect(entry.createdAt).toBe(new Date(entry.createdAt).toISOString());

    const row = await prisma.auditLog.findUniqueOrThrow({
      where: { id: entry.id },
    });
    expect(row.action).toBe("reservation.cancel");
  });

  it("metadata 없이 기록하면 metadata는 null이다", async () => {
    const entry = await recordAuditLog({
      adminUid: "admin-1",
      action: "gym.update",
      targetType: "gym",
      targetId: "gym-1",
      summary: "시설 수정",
    });

    expect(entry.metadata).toBeNull();
  });
});

describe("safeRecordAuditLog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("정상 입력은 행을 남긴다", async () => {
    await safeRecordAuditLog({
      adminUid: "admin-2",
      action: "gym.create",
      targetType: "gym",
      targetId: "gym-2",
      summary: "시설 생성",
    });

    const rows = await prisma.auditLog.findMany({
      where: { targetId: "gym-2" },
    });
    expect(rows).toHaveLength(1);
  });

  it("기록이 실패해도 throw하지 않고 stderr에만 남긴다(본 mutation 격리)", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.spyOn(prisma.auditLog, "create").mockRejectedValueOnce(
      new Error("database offline"),
    );

    await expect(
      safeRecordAuditLog({
        adminUid: "admin-3",
        action: "reservation.use",
        targetType: "reservation",
        targetId: "res-x",
        summary: "이용 완료",
      }),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledOnce();
    // 로그에는 action/target 식별자만 남기고 summary 원문은 남기지 않는다.
    const [message] = errorSpy.mock.calls[0] ?? [];
    expect(String(message)).toContain("reservation.use");
    expect(String(message)).not.toContain("이용 완료");
  });
});

describe("listAuditLogs", () => {
  it("최신순으로 반환하고 targetType/targetId/action/adminUid로 필터한다", async () => {
    await recordAuditLog({
      adminUid: "admin-a",
      action: "gym.create",
      targetType: "gym",
      targetId: "gym-list-1",
      summary: "시설 생성",
    });
    await recordAuditLog({
      adminUid: "admin-b",
      action: "reservation.cancel",
      targetType: "reservation",
      targetId: "res-list-1",
      summary: "예약 취소",
    });
    await recordAuditLog({
      adminUid: "admin-a",
      action: "reservation.use",
      targetType: "reservation",
      targetId: "res-list-1",
      summary: "이용 완료",
    });

    const all = await listAuditLogs();
    expect(all).toHaveLength(3);
    // tie-safe: createdAt 단조 감소(desc)인지만 확인한다(같은 ms 충돌 회피).
    for (let i = 0; i < all.length - 1; i += 1) {
      expect(all[i].createdAt >= all[i + 1].createdAt).toBe(true);
    }

    const byTarget = await listAuditLogs({
      targetType: "reservation",
      targetId: "res-list-1",
    });
    expect(byTarget).toHaveLength(2);
    expect(byTarget.every((entry) => entry.targetId === "res-list-1")).toBe(
      true,
    );

    const byAdmin = await listAuditLogs({ adminUid: "admin-a" });
    expect(byAdmin).toHaveLength(2);
    expect(byAdmin.every((entry) => entry.adminUid === "admin-a")).toBe(true);

    const byAction = await listAuditLogs({ action: "gym.create" });
    expect(byAction).toHaveLength(1);
    expect(byAction[0]?.targetId).toBe("gym-list-1");
  });

  it("limit으로 개수를 제한한다", async () => {
    for (let i = 0; i < 5; i += 1) {
      await recordAuditLog({
        adminUid: "admin-limit",
        action: "gym.update",
        targetType: "gym",
        targetId: `gym-limit-${i}`,
        summary: "시설 수정",
      });
    }

    const limited = await listAuditLogs({ limit: 2 });
    expect(limited).toHaveLength(2);
  });
});
