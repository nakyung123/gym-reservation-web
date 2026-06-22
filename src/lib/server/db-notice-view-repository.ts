import "server-only";
import { prisma } from "@/lib/server/prisma-client";

// 공지 조회수 카운터 접근 경계.
// SSOT 분리: 공지 본문/메타(제목·날짜·카테고리·본문)는 코드(src/lib/notices.ts)가 SSOT이고,
// 조회수만 동적이라 여기서 noticeId별 누적 카운트만 보관한다. noticeId가 두 곳을 잇는 키다.

// 상세 진입 시 +1 하고 갱신된 누적 조회수를 반환한다. 행이 없으면 1로 생성(upsert).
// 멱등성 주의: 의도적으로 호출마다 1 증가한다(조회 1회 = +1). 프리페치로 인한 중복 증가는
// 호출 측(상세 force-dynamic + 목록 Link prefetch=false)에서 차단한다.
export async function incrementNoticeView(noticeId: string): Promise<number> {
  const row = await prisma.noticeView.upsert({
    where: { noticeId },
    create: { noticeId, count: 1 },
    update: { count: { increment: 1 } },
    select: { count: true },
  });
  return row.count;
}

// 조회수만 읽는다(증가 없음). 행이 없으면 0. 증가 실패 시 폴백 표시용.
export async function getNoticeViewCount(noticeId: string): Promise<number> {
  const row = await prisma.noticeView.findUnique({
    where: { noticeId },
    select: { count: true },
  });
  return row?.count ?? 0;
}
