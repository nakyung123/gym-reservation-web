import { describe, expect, it } from "vitest";
import {
  createUserNote,
  deleteUserNote,
  listUserNotes,
} from "@/lib/server/db-user-note-repository";
import { prisma } from "@/lib/server/prisma-client";

describe("createUserNote", () => {
  it("메모를 만들고 도메인 형태(createdAt ISO)로 반환한다", async () => {
    const note = await createUserNote({
      userId: "note-user-1",
      adminUid: "admin-1",
      body: "VIP 고객",
    });

    expect(note).toMatchObject({
      userId: "note-user-1",
      adminUid: "admin-1",
      body: "VIP 고객",
    });
    expect(typeof note.id).toBe("string");
    expect(note.createdAt).toBe(new Date(note.createdAt).toISOString());

    const row = await prisma.userNote.findUniqueOrThrow({
      where: { id: note.id },
    });
    expect(row.body).toBe("VIP 고객");
  });
});

describe("listUserNotes", () => {
  it("해당 고객의 메모만 최신순(createdAt desc)으로 반환한다", async () => {
    await createUserNote({
      userId: "note-user-2",
      adminUid: "admin-1",
      body: "첫 메모",
    });
    await createUserNote({
      userId: "note-user-2",
      adminUid: "admin-1",
      body: "둘째 메모",
    });
    await createUserNote({
      userId: "note-other",
      adminUid: "admin-1",
      body: "다른 고객 메모",
    });

    const notes = await listUserNotes("note-user-2");
    expect(notes).toHaveLength(2);
    expect(notes.every((note) => note.userId === "note-user-2")).toBe(true);
    // tie-safe: createdAt이 단조 감소(desc)인지만 확인한다.
    for (let i = 0; i < notes.length - 1; i += 1) {
      expect(
        notes[i].createdAt >= notes[i + 1].createdAt,
      ).toBe(true);
    }
  });
});

describe("deleteUserNote", () => {
  it("noteId+userId 범위로만 삭제하고 교차 삭제를 막는다", async () => {
    const note = await createUserNote({
      userId: "note-user-3",
      adminUid: "admin-1",
      body: "삭제 대상",
    });

    // 다른 userId로 삭제 시도 → 없음(ok:false), 행은 유지된다.
    await expect(deleteUserNote(note.id, "wrong-user")).resolves.toEqual({
      ok: false,
    });
    await expect(
      prisma.userNote.findUnique({ where: { id: note.id } }),
    ).resolves.not.toBeNull();

    // 올바른 userId → 삭제.
    await expect(deleteUserNote(note.id, "note-user-3")).resolves.toEqual({
      ok: true,
    });

    // 재삭제는 idempotent하게 ok:false.
    await expect(deleteUserNote(note.id, "note-user-3")).resolves.toEqual({
      ok: false,
    });
  });
});
