"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRequireAuth } from "@/lib/use-require-auth";
import { fetchInquiry } from "@/lib/inquiry-client";
import type { Inquiry } from "@/types/domain";

// 마이페이지 1:1 문의 상세. 공지 상세(/notice/[id]) 레이아웃을 따르되,
// 인증 토큰이 필요해 서버 렌더가 아닌 클라이언트에서 fetchInquiry로 불러온다(본인 것만 200).
// - 본문 아래 답변 블록: answered면 관리자 답변, open이면 '답변 준비 중' 안내.
// - 404/403은 not-found·error 상태로 명시(빈 화면 폴백 금지).

type State =
  | { status: "loading" }
  | { status: "ready"; inquiry: Inquiry }
  | { status: "not-found" }
  | { status: "error"; message: string };

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

// 등록일 표기(YYYY.MM.DD). 잘못된 ISO면 앞 10자 폴백.
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

export default function InquiryDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? (params.id[0] ?? "") : (params.id ?? "");
  const t = useTranslations("Mypage");
  useRequireAuth({ from: `/mypage/inquiries/${id}` });
  const [state, setState] = useState<State>({ status: "loading" });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setState({ status: "loading" });
    fetchInquiry(id, controller.signal)
      .then((result) => {
        if (result.ok) {
          setState({ status: "ready", inquiry: result.inquiry });
          return;
        }
        if (result.kind === "not-found") {
          setState({ status: "not-found" });
          return;
        }
        setState({ status: "error", message: result.message });
      })
      .catch((error) => {
        if (isAbortError(error)) return;
        setState({
          status: "error",
          message:
            error instanceof Error && error.message
              ? error.message
              : "문의를 불러오지 못했습니다.",
        });
      });
    return () => controller.abort();
  }, [id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <main className="mx-auto w-full max-w-[1440px] px-5 py-10 sm:px-8 sm:py-12">
      {/* breadcrumb: 홈 / 마이페이지 / 문의 내역 */}
      <nav aria-label="breadcrumb" className="text-[13px] text-muted">
        <ol className="flex items-center gap-1.5">
          <li>
            <Link href="/" className="transition hover:text-accent-strong">
              {t("breadcrumbHome")}
            </Link>
          </li>
          <li aria-hidden="true" className="text-line-strong">
            /
          </li>
          <li>
            <Link
              href="/mypage?tab=inquiries"
              className="transition hover:text-accent-strong"
            >
              {t("tabInquiries")}
            </Link>
          </li>
          <li aria-hidden="true" className="text-line-strong">
            /
          </li>
          <li className="font-semibold text-foreground">{t("title")}</li>
        </ol>
      </nav>

      <div className="mt-6">
        {state.status === "loading" ? (
          <div
            className="rounded-md border border-line bg-slate-50 px-4 py-16 text-center text-sm font-semibold text-slate-600"
            aria-live="polite"
            aria-busy="true"
          >
            {t("inqDetailLoading")}
          </div>
        ) : state.status === "not-found" ? (
          <StatusNote message={t("inqNotFound")} />
        ) : state.status === "error" ? (
          <StatusNote message={`${t("inqLoadErrorTitle")} ${state.message}`} isError />
        ) : (
          <InquiryBody inquiry={state.inquiry} />
        )}
      </div>

      {/* 목록 버튼 (공지 상세와 동일 규격: 160×60 radius30 네이비 가운데) */}
      <div className="mt-10 flex justify-center">
        <Link
          href="/mypage?tab=inquiries"
          className="inline-flex h-[60px] min-w-[160px] items-center justify-center rounded-[30px] bg-accent px-8 text-[18px] font-medium text-white transition hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          {t("inqBackToList")}
        </Link>
      </div>
    </main>
  );
}

function StatusNote({
  message,
  isError = false,
}: {
  message: string;
  isError?: boolean;
}) {
  return (
    <div
      className={`rounded-md border px-4 py-16 text-center text-sm font-semibold ${
        isError
          ? "border-error/30 bg-error/10 text-error"
          : "border-line bg-slate-50 text-slate-600"
      }`}
      role={isError ? "alert" : "status"}
    >
      {message}
    </div>
  );
}

function InquiryBody({ inquiry }: { inquiry: Inquiry }) {
  const t = useTranslations("Mypage");
  const answered = inquiry.status === "answered";

  return (
    <article>
      {/* 제목 + 메타 (공지 상세 page-header 톤) */}
      <header className="border-b border-line pb-6 sm:pb-8">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex h-7 items-center rounded-full px-3 text-[13px] font-semibold ${
              answered
                ? "bg-accent text-white"
                : "border border-line-strong bg-surface-2 text-muted"
            }`}
          >
            {answered ? t("inqStatusAnswered") : t("inqStatusOpen")}
          </span>
          <time
            dateTime={inquiry.createdAt}
            className="text-[14px] tabular-nums text-[#555]"
          >
            {formatDate(inquiry.createdAt)}
          </time>
        </div>
        <h1 className="mt-4 text-[24px] font-bold leading-snug text-[#1d1d1d] sm:text-[30px]">
          {inquiry.title}
        </h1>
      </header>

      {/* 문의 내용 */}
      <section className="mt-8">
        <h2 className="text-[15px] font-bold text-muted">{t("inqBodyHeading")}</h2>
        <div className="mt-3 whitespace-pre-line text-[16px] leading-[1.8] text-[#1d1d1d] sm:text-[17px]">
          {inquiry.body}
        </div>
      </section>

      {/* 답변 */}
      <section className="mt-8 rounded-xl border border-line bg-surface-2/50 p-5 sm:p-6">
        <h2 className="text-[15px] font-bold text-accent-strong">
          {t("inqAnswerHeading")}
        </h2>
        {answered && inquiry.answer ? (
          <div className="mt-3 whitespace-pre-line text-[16px] leading-[1.8] text-[#1d1d1d] sm:text-[17px]">
            {inquiry.answer}
          </div>
        ) : (
          <p className="mt-3 text-[15px] text-muted">{t("inqAnswerPending")}</p>
        )}
      </section>
    </article>
  );
}
