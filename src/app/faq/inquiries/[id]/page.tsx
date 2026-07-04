import type { Metadata } from "next";
import Link from "next/link";
import { VocDetailView } from "@/components/voc-detail-view";
import { gymRepository } from "@/lib/gym-repository-provider";

export const metadata: Metadata = {
  title: "문의 상세 — 서울체육예약",
  description: "서울체육예약 문의 게시판 글 상세입니다.",
};

type Params = { params: Promise<{ id: string }> };

// 공개 문의 게시판 상세 페이지. 본문은 클라이언트에서 비밀번호 인증 후에만 노출한다.
// 센터명 해석을 위해 시설 목록만 서버에서 넘긴다(본문/개인정보는 넘기지 않는다).
export default async function VocDetailPage({ params }: Params) {
  const { id } = await params;
  const gyms = await gymRepository.list();

  return (
    <main className="mx-auto w-full max-w-[1440px] px-5 py-10 sm:px-8 sm:py-12">
      <nav aria-label="breadcrumb" className="text-[13px] text-muted">
        <ol className="flex items-center gap-1.5">
          <li>
            <Link href="/" className="transition hover:text-accent-strong">
              홈
            </Link>
          </li>
          <li aria-hidden="true" className="text-line-strong">
            /
          </li>
          <li>
            <Link
              href="/faq?cat=support"
              className="transition hover:text-accent-strong"
            >
              문의·FAQ
            </Link>
          </li>
          <li aria-hidden="true" className="text-line-strong">
            /
          </li>
          <li className="font-semibold text-foreground">문의 상세</li>
        </ol>
      </nav>

      <h1 className="mt-4 text-[28px] font-bold text-foreground sm:text-[32px]">
        문의 게시판
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">
        비공개 글입니다. 작성 시 입력한 임시 비밀번호를 입력해 주세요.
      </p>

      <VocDetailView id={id} gyms={gyms} />
    </main>
  );
}
