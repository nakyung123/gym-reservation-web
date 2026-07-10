import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listAdminAccessLogs,
  recordAdminAccess,
  safeRecordAdminAccess,
} from "@/lib/server/db-admin-access-repository";
import { prisma } from "@/lib/server/prisma-client";

describe("recordAdminAccess", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("접속 행을 만들고 도메인 형태로 반환한다(createdAt ISO)", async () => {
    const entry = await recordAdminAccess({
      adminUid: "admin-1",
      ip: "203.0.113.7",
      userAgent: "Mozilla/5.0 (Test)",
      path: "/admin/reservations",
    });

    expect(entry).toMatchObject({
      adminUid: "admin-1",
      ip: "203.0.113.7",
      userAgent: "Mozilla/5.0 (Test)",
      path: "/admin/reservations",
    });
    expect(typeof entry.id).toBe("string");
    expect(entry.createdAt).toBe(new Date(entry.createdAt).toISOString());

    const row = await prisma.adminAccessLog.findUniqueOrThrow({
      where: { id: entry.id },
    });
    expect(row.adminUid).toBe("admin-1");
  });

  it("컬럼 상한을 넘는 userAgent는 절단해 저장한다", async () => {
    const longUa = "a".repeat(400);
    const entry = await recordAdminAccess({
      adminUid: "admin-1",
      ip: "203.0.113.7",
      userAgent: longUa,
      path: "/admin",
    });

    expect(entry.userAgent).toHaveLength(256);
  });
});

describe("safeRecordAdminAccess", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("정상 입력은 행을 남긴다", async () => {
    await safeRecordAdminAccess({
      adminUid: "admin-2",
      ip: "198.51.100.4",
      userAgent: "UA",
      path: "/admin",
    });

    const rows = await prisma.adminAccessLog.findMany({
      where: { adminUid: "admin-2" },
    });
    expect(rows).toHaveLength(1);
  });

  it("기록이 실패해도 throw하지 않고 stderr에만 남긴다(콘솔 진입 격리)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.adminAccessLog, "create").mockRejectedValueOnce(
      new Error("database offline"),
    );

    await expect(
      safeRecordAdminAccess({
        adminUid: "admin-3",
        ip: "198.51.100.9",
        userAgent: "UA",
        path: "/admin",
      }),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledOnce();
    // 로그에는 adminUid만 남기고 ip/userAgent 원문은 남기지 않는다.
    const [message] = errorSpy.mock.calls[0] ?? [];
    expect(String(message)).toContain("admin-3");
    expect(String(message)).not.toContain("198.51.100.9");
  });
});

describe("listAdminAccessLogs", () => {
  it("최신순으로 반환하고 adminUid로 필터한다", async () => {
    await recordAdminAccess({
      adminUid: "admin-a",
      ip: "203.0.113.1",
      userAgent: "UA",
      path: "/admin",
    });
    await recordAdminAccess({
      adminUid: "admin-b",
      ip: "203.0.113.2",
      userAgent: "UA",
      path: "/admin/gyms",
    });
    await recordAdminAccess({
      adminUid: "admin-a",
      ip: "203.0.113.3",
      userAgent: "UA",
      path: "/admin/reservations",
    });

    const all = await listAdminAccessLogs();
    expect(all).toHaveLength(3);
    // tie-safe: createdAt 단조 감소(desc)인지만 확인한다(같은 ms 충돌 회피).
    for (let i = 0; i < all.length - 1; i += 1) {
      expect(all[i].createdAt >= all[i + 1].createdAt).toBe(true);
    }

    const byAdmin = await listAdminAccessLogs({ adminUid: "admin-a" });
    expect(byAdmin).toHaveLength(2);
    expect(byAdmin.every((entry) => entry.adminUid === "admin-a")).toBe(true);
  });

  it("limit으로 개수를 제한한다", async () => {
    for (let i = 0; i < 5; i += 1) {
      await recordAdminAccess({
        adminUid: "admin-limit",
        ip: `203.0.113.${i}`,
        userAgent: "UA",
        path: "/admin",
      });
    }

    const limited = await listAdminAccessLogs({ limit: 2 });
    expect(limited).toHaveLength(2);
  });
});
