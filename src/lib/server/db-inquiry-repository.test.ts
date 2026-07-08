import { describe, expect, it } from "vitest";
import {
  answerInquiryInDb,
  createInquiryInDb,
  getUserInquiryById,
  listAdminInquiries,
  listUserInquiries,
} from "@/lib/server/db-inquiry-repository";
import { prisma } from "@/lib/server/prisma-client";
import "@tests/setup-db";

const userA = "inq-user-a";
const userB = "inq-user-b";

function draft(userId: string, overrides: Partial<{ title: string; body: string; gymId: string | null }> = {}) {
  return {
    userId,
    title: overrides.title ?? "문의 제목",
    body: overrides.body ?? "문의 내용입니다.",
    gymId: overrides.gymId ?? null,
  };
}

describe("createInquiryInDb", () => {
  it("문의를 생성하면 status=open, answer/answeredAt은 null이다", async () => {
    const { inquiry, reused } = await createInquiryInDb(draft(userA));

    expect(reused).toBe(false);
    expect(inquiry.userId).toBe(userA);
    expect(inquiry.status).toBe("open");
    expect(inquiry.answer).toBeNull();
    expect(inquiry.answeredAt).toBeNull();
    expect(inquiry.gymId).toBeNull();

    expect(await prisma.inquiry.count()).toBe(1);
  });

  it("같은 uid가 동일 title+body를 60초 내 재전송하면 기존 건을 반환한다(멱등)", async () => {
    const first = await createInquiryInDb(draft(userA));
    const second = await createInquiryInDb(draft(userA));

    expect(second.reused).toBe(true);
    expect(second.inquiry.id).toBe(first.inquiry.id);
    expect(await prisma.inquiry.count()).toBe(1);
  });

  it("내용이 다르면 새 문의가 생성된다", async () => {
    await createInquiryInDb(draft(userA, { body: "첫 번째" }));
    const second = await createInquiryInDb(draft(userA, { body: "두 번째" }));

    expect(second.reused).toBe(false);
    expect(await prisma.inquiry.count()).toBe(2);
  });

  it("다른 사용자의 동일 내용은 중복으로 보지 않는다", async () => {
    await createInquiryInDb(draft(userA));
    const other = await createInquiryInDb(draft(userB));

    expect(other.reused).toBe(false);
    expect(await prisma.inquiry.count()).toBe(2);
  });

  it("같은 내용이라도 대상 gymId가 다르면 별개 문의로 생성된다", async () => {
    await createInquiryInDb(draft(userA, { gymId: "gym-alpha" }));
    const other = await createInquiryInDb(draft(userA, { gymId: "gym-beta" }));
    const general = await createInquiryInDb(draft(userA));

    expect(other.reused).toBe(false);
    expect(general.reused).toBe(false);
    expect(await prisma.inquiry.count()).toBe(3);
  });
});

describe("listUserInquiries", () => {
  it("본인 문의만 최신순으로 반환하고 total을 함께 준다", async () => {
    await createInquiryInDb(draft(userA, { title: "A1" }));
    await createInquiryInDb(draft(userA, { title: "A2" }));
    await createInquiryInDb(draft(userB, { title: "B1" }));

    const result = await listUserInquiries(userA);

    expect(result.total).toBe(2);
    expect(result.inquiries.every((inq) => inq.userId === userA)).toBe(true);
  });

  it("페이지 크기(10)를 넘으면 페이지네이션된다", async () => {
    for (let i = 0; i < 12; i += 1) {
      await createInquiryInDb(draft(userA, { title: `제목 ${i}`, body: `내용 ${i}` }));
    }

    const page1 = await listUserInquiries(userA, { page: 1 });
    const page2 = await listUserInquiries(userA, { page: 2 });

    expect(page1.total).toBe(12);
    expect(page1.inquiries).toHaveLength(10);
    expect(page2.inquiries).toHaveLength(2);
  });
});

describe("getUserInquiryById (IDOR)", () => {
  it("본인 문의는 조회되고, 남의 문의는 null이다", async () => {
    const { inquiry } = await createInquiryInDb(draft(userA));

    expect(await getUserInquiryById(userA, inquiry.id)).not.toBeNull();
    // 남의 uid로 같은 id 요청 → null (라우트에서 404로 은닉)
    expect(await getUserInquiryById(userB, inquiry.id)).toBeNull();
    // 없는 id → null
    expect(await getUserInquiryById(userA, "no-such-id")).toBeNull();
  });
});

describe("answerInquiryInDb", () => {
  it("답변 저장 시 status=answered, answeredAt이 세팅된다", async () => {
    const { inquiry } = await createInquiryInDb(draft(userA));

    const answered = await answerInquiryInDb(inquiry.id, "답변 드립니다.");

    expect(answered).not.toBeNull();
    expect(answered?.status).toBe("answered");
    expect(answered?.answer).toBe("답변 드립니다.");
    expect(answered?.answeredAt).not.toBeNull();
  });

  it("재저장 시 최신 answer로 덮어쓰기(중복 레코드 없음)", async () => {
    const { inquiry } = await createInquiryInDb(draft(userA));

    await answerInquiryInDb(inquiry.id, "첫 답변");
    const again = await answerInquiryInDb(inquiry.id, "수정된 답변");

    expect(again?.answer).toBe("수정된 답변");
    expect(await prisma.inquiry.count()).toBe(1);
  });

  it("없는 문의면 null", async () => {
    expect(await answerInquiryInDb("no-such-id", "답변")).toBeNull();
  });
});

describe("listAdminInquiries", () => {
  it("status 필터와 userLabel(user_profiles 파생)을 반환한다", async () => {
    await prisma.userProfile.create({
      data: { userId: userA, name: "홍길동", preferredSports: [] },
    });
    const { inquiry } = await createInquiryInDb(draft(userA, { title: "열린 문의" }));
    await answerInquiryInDb(
      (await createInquiryInDb(draft(userA, { title: "답변된 문의" }))).inquiry.id,
      "답변",
    );

    const open = await listAdminInquiries({ status: "open" });
    expect(open.total).toBe(1);
    expect(open.inquiries[0].id).toBe(inquiry.id);
    expect(open.inquiries[0].userLabel).toBe("홍길동");

    const answered = await listAdminInquiries({ status: "answered" });
    expect(answered.total).toBe(1);

    const all = await listAdminInquiries();
    expect(all.total).toBe(2);
  });

  it("프로필이 없으면 userLabel은 uid 축약", async () => {
    await createInquiryInDb(draft(userB));
    const all = await listAdminInquiries();
    expect(all.inquiries[0].userLabel).toBe(`${userB.slice(0, 8)}…`);
  });
});
