import { describe, expect, it } from "vitest";
import { createVocPost, verifyVocPost } from "@/lib/server/db-voc-repository";
import { prisma } from "@/lib/server/prisma-client";
import type { VocValidated } from "@/lib/voc";
import "@tests/setup-db";

// 공개 문의 게시판 저장소의 dedup(멱등)·비밀번호 검증 동작을 DB로 검증한다.
// dedup 매칭 키 = userId + authorName + category + body (60초 창).

function draft(overrides: Partial<VocValidated> = {}): VocValidated {
  return {
    category: "inquiry",
    gymId: null,
    authorName: "홍길동",
    phone: null,
    email: null,
    body: "문의 내용입니다.",
    password: "1234",
    ...overrides,
  };
}

describe("createVocPost", () => {
  it("같은 작성자가 동일 분류+본문을 60초 내 재전송하면 기존 글을 재사용한다(멱등)", async () => {
    const first = await createVocPost(draft(), "voc-user-a");
    const second = await createVocPost(draft(), "voc-user-a");

    expect(second.reused).toBe(true);
    expect(second.post.id).toBe(first.post.id);
    expect(await prisma.vocPost.count()).toBe(1);
  });

  it("동명의 다른 작성자(익명 vs 로그인) 글은 오병합하지 않는다", async () => {
    // 익명(userId=null) 글과 같은 성명·분류·본문의 로그인 글 — 별개 글이어야 한다.
    const anonymous = await createVocPost(draft({ password: "1111" }), null);
    const loggedIn = await createVocPost(draft({ password: "2222" }), "voc-user-b");

    expect(loggedIn.reused).toBe(false);
    expect(loggedIn.post.id).not.toBe(anonymous.post.id);
    expect(await prisma.vocPost.count()).toBe(2);

    // 각 글이 자기 비밀번호로만 열린다(두 번째 작성자의 비밀번호 유실 없음).
    await expect(verifyVocPost(anonymous.post.id, "1111")).resolves.toMatchObject({
      ok: true,
    });
    await expect(verifyVocPost(loggedIn.post.id, "2222")).resolves.toMatchObject({
      ok: true,
    });
    await expect(verifyVocPost(loggedIn.post.id, "1111")).resolves.toMatchObject({
      ok: false,
      reason: "invalid-password",
    });
  });

  it("공개 응답에는 성명이 마스킹되고 연락처/비밀번호가 노출되지 않는다", async () => {
    const { post } = await createVocPost(
      draft({ phone: "010-1234-5678", email: "voc@example.com" }),
      null,
    );

    expect(post.authorName).not.toBe("홍길동");
    expect(post).not.toHaveProperty("phone");
    expect(post).not.toHaveProperty("email");
    expect(post).not.toHaveProperty("passwordHash");
  });
});
