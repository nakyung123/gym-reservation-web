import "server-only";
import { prisma } from "@/lib/server/prisma-client";
import { isInquiryStatus } from "@/lib/domain-constants";
import { INQUIRY_DEDUP_WINDOW_MS } from "@/lib/inquiry";
import type { Inquiry, InquiryStatus } from "@/types/domain";
import type { Prisma } from "@prisma/client";

type InquiryRow = Prisma.InquiryGetPayload<Prisma.InquiryDefaultArgs>;

// 마이페이지 목록과 동일한 페이지 크기(mypage-view PER_PAGE=10).
export const INQUIRY_PAGE_SIZE = 10;

// Prisma row → 도메인 Inquiry. status는 문자열 컬럼이라 안전 변환(미지 값은 open으로 폴백).
function toDomainInquiry(row: InquiryRow): Inquiry {
  const status: InquiryStatus = isInquiryStatus(row.status) ? row.status : "open";
  return {
    id: row.id,
    userId: row.userId,
    gymId: row.gymId,
    title: row.title,
    body: row.body,
    status,
    answer: row.answer,
    answeredAt: row.answeredAt ? row.answeredAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export type CreateInquiryInput = {
  userId: string;
  title: string;
  body: string;
  gymId: string | null;
};

// 1:1 문의 등록. 멱등성: 같은 uid가 동일 title+body를 60초 내 재전송하면 기존 건을 반환한다
// (등록 더블클릭·네트워크 재시도 시 중복 레코드 방지). reused=true면 신규 생성이 아니다.
export async function createInquiryInDb(
  input: CreateInquiryInput,
): Promise<{ inquiry: Inquiry; reused: boolean }> {
  const since = new Date(Date.now() - INQUIRY_DEDUP_WINDOW_MS);
  const existing = await prisma.inquiry.findFirst({
    where: {
      userId: input.userId,
      title: input.title,
      body: input.body,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    return { inquiry: toDomainInquiry(existing), reused: true };
  }

  const created = await prisma.inquiry.create({
    data: {
      userId: input.userId,
      title: input.title,
      body: input.body,
      gymId: input.gymId,
      status: "open",
    },
  });
  return { inquiry: toDomainInquiry(created), reused: false };
}

// 본인 문의 목록(항상 userId 스코프). page는 1-base.
export async function listUserInquiries(
  userId: string,
  { page = 1 }: { page?: number } = {},
): Promise<{ inquiries: Inquiry[]; total: number }> {
  const safePage = Math.max(1, Math.trunc(page));
  const [rows, total] = await Promise.all([
    prisma.inquiry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * INQUIRY_PAGE_SIZE,
      take: INQUIRY_PAGE_SIZE,
    }),
    prisma.inquiry.count({ where: { userId } }),
  ]);
  return { inquiries: rows.map(toDomainInquiry), total };
}

// 본인 문의 단건(IDOR 차단: userId 스코프. 남의 것/없는 것은 null).
export async function getUserInquiryById(
  userId: string,
  inquiryId: string,
): Promise<Inquiry | null> {
  const row = await prisma.inquiry.findFirst({
    where: { id: inquiryId, userId },
  });
  return row ? toDomainInquiry(row) : null;
}

export type AdminInquiry = Inquiry & { userLabel: string };

export type ListAdminInquiriesInput = {
  status?: InquiryStatus;
  page?: number;
};

// 관리자 문의 목록. status 필터(생략=전체). userLabel은 user_profiles에서 파생(없으면 uid 축약).
export async function listAdminInquiries({
  status,
  page = 1,
}: ListAdminInquiriesInput = {}): Promise<{
  inquiries: AdminInquiry[];
  total: number;
}> {
  const safePage = Math.max(1, Math.trunc(page));
  const where: Prisma.InquiryWhereInput = status ? { status } : {};

  const [rows, total] = await Promise.all([
    prisma.inquiry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * INQUIRY_PAGE_SIZE,
      take: INQUIRY_PAGE_SIZE,
    }),
    prisma.inquiry.count({ where }),
  ]);

  const userIds = [...new Set(rows.map((row) => row.userId))];
  const profiles =
    userIds.length > 0
      ? await prisma.userProfile.findMany({
          where: { userId: { in: userIds } },
          select: { userId: true, name: true, loginId: true, nickname: true },
        })
      : [];
  const labelByUser = new Map(
    profiles.map((profile) => [
      profile.userId,
      profile.name ?? profile.loginId ?? profile.nickname ?? "",
    ]),
  );

  const inquiries: AdminInquiry[] = rows.map((row) => ({
    ...toDomainInquiry(row),
    userLabel: labelByUser.get(row.userId) || `${row.userId.slice(0, 8)}…`,
  }));
  return { inquiries, total };
}

// 관리자 답변 저장. answer + status=answered + answeredAt=now를 단일 update로(부분 실패 없음).
// 멱등성: 재저장 시 최신 answer로 덮어쓰기(중복 레코드 없음). 대상 없으면 null.
export async function answerInquiryInDb(
  inquiryId: string,
  answer: string,
): Promise<Inquiry | null> {
  const result = await prisma.inquiry.updateMany({
    where: { id: inquiryId },
    data: { answer, status: "answered", answeredAt: new Date() },
  });
  if (result.count === 0) {
    return null;
  }
  const row = await prisma.inquiry.findUnique({ where: { id: inquiryId } });
  return row ? toDomainInquiry(row) : null;
}
