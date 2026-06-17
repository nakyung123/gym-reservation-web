import { describe, expect, it } from "vitest";
import { getNotice, listNotices } from "@/lib/notices";

// 공지 SSOT의 정렬·조회만 검증한다(DB/네트워크 무관). vitest.unit.config.ts include 대상.

describe("listNotices", () => {
  it("발행일 최신순으로 전체 공지를 반환한다", () => {
    const notices = listNotices();
    expect(notices.length).toBeGreaterThan(0);

    const dates = notices.map((notice) => notice.date);
    const descending = [...dates].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    expect(dates).toEqual(descending);
  });

  it("id가 중복되지 않는다", () => {
    const ids = listNotices().map((notice) => notice.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("getNotice", () => {
  it("존재하는 id는 해당 공지를, 없으면 null을 반환한다", () => {
    const first = listNotices()[0];
    expect(getNotice(first.id)?.title).toBe(first.title);
    expect(getNotice("does-not-exist")).toBeNull();
  });
});
