import { describe, expect, it } from "vitest";
import {
  getNoticeViewCount,
  incrementNoticeView,
} from "@/lib/server/db-notice-view-repository";
import { prisma } from "@/lib/server/prisma-client";

describe("getNoticeViewCount", () => {
  it("행이 없으면 0을 반환한다", async () => {
    await expect(getNoticeViewCount("nv-absent")).resolves.toBe(0);
  });
});

describe("incrementNoticeView", () => {
  it("첫 조회는 1로 생성(upsert)하고, 이후 호출마다 누적 증가한다", async () => {
    await expect(incrementNoticeView("nv-count")).resolves.toBe(1);
    await expect(incrementNoticeView("nv-count")).resolves.toBe(2);
    await expect(incrementNoticeView("nv-count")).resolves.toBe(3);

    await expect(getNoticeViewCount("nv-count")).resolves.toBe(3);

    const row = await prisma.noticeView.findUniqueOrThrow({
      where: { noticeId: "nv-count" },
    });
    expect(row.count).toBe(3);
  });

  it("noticeId 범위로만 증가하고 다른 공지의 카운트에 영향을 주지 않는다", async () => {
    await incrementNoticeView("nv-a");
    await incrementNoticeView("nv-a");
    await incrementNoticeView("nv-b");

    expect(await getNoticeViewCount("nv-a")).toBe(2);
    expect(await getNoticeViewCount("nv-b")).toBe(1);
  });
});
