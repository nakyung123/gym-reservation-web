import type { Metadata } from "next";
import Link from "next/link";
import { VocWriteForm } from "@/components/voc-write-form";
import { gymRepository } from "@/lib/gym-repository-provider";

export const metadata: Metadata = {
  title: "문의 등록 — 서울체육예약",
  description: "서울체육예약 문의 게시판에 문의를 등록합니다.",
};

// 공개 문의 게시판 글쓰기 페이지. 체육관 선택지는 서버에서 시설 목록을 받아 폼에 넘긴다.
export default async function VocWritePage() {
  const gyms = await gymRepository.list();

  return (
    <main className="mx-auto w-full max-w-[1440px] px-5 pt-10 pb-[140px] sm:px-8 sm:pt-12">
      {/* breadcrumb */}
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
          <li className="font-semibold text-foreground">문의 등록</li>
        </ol>
      </nav>

      <h1 className="mt-4 text-[28px] font-bold text-foreground sm:text-[32px]">
        문의 등록
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">
        문의 내용을 남겨주시면 확인 후 답변 드리겠습니다.
      </p>

      <VocWriteForm gyms={gyms} />
    </main>
  );
}
