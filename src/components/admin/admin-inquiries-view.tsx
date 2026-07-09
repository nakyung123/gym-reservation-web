"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  answerInquiry,
  fetchAdminInquiries,
  type AdminInquiry,
  type AdminInquiryStatusFilter,
} from "@/lib/admin/inquiry";
import { INQUIRY_ANSWER_MAX, INQUIRY_PAGE_SIZE, inquiryStatusLabel } from "@/lib/inquiry";
import { formatAdminDateTime } from "@/lib/admin/format";
import {
  AdminButtonSpinner,
  AdminEmptyState,
  AdminLoadingRow,
} from "@/components/admin/admin-async-state";
import type { InquiryStatus } from "@/types/domain";

type InquiriesState =
  | { status: "loading" }
  | { status: "ready"; inquiries: AdminInquiry[]; total: number }
  | { status: "error"; message: string };

type Notice = {
  tone: "success" | "error";
  message: string;
};

const noticeStyles: Record<Notice["tone"], string> = {
  success: "border-success/30 bg-success/10 text-success",
  error: "border-error/30 bg-error/10 text-error",
};

// 필터 탭. 기본은 "답변 대기"(운영자가 처리할 일 우선).
const FILTER_OPTIONS: { value: AdminInquiryStatusFilter; label: string }[] = [
  { value: "open", label: inquiryStatusLabel.open },
  { value: "answered", label: inquiryStatusLabel.answered },
  { value: "all", label: "전체" },
];

// 문의 상태 뱃지. 관리자 테이블의 bordered-pill 포맷을 따르고,
// 대기=warning 틴트(처리 필요), 완료=중립으로 표현한다.
const statusBadgeStyles: Record<InquiryStatus, string> = {
  open: "border-warning/30 bg-warning/10 text-warning",
  answered: "border-line bg-surface-2 text-muted",
};

export function AdminInquiriesView() {
  const [filter, setFilter] = useState<AdminInquiryStatusFilter>("open");
  const [page, setPage] = useState(1);
  const [state, setState] = useState<InquiriesState>({ status: "loading" });
  const [notice, setNotice] = useState<Notice | null>(null);
  // 답변 작성 폼이 열린 문의 id와 초안. 한 번에 하나만 연다.
  const [openFormId, setOpenFormId] = useState<string | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  // 같은 조건 재조회용 nonce(답변 저장 후 목록 갱신에도 사용).
  const [reloadKey, setReloadKey] = useState(0);

  // 마운트/필터/페이지 변경 시 자동 로드. effect body에서 곧바로 setState 하지 않도록
  // setTimeout(0)로 미룬다(다른 admin view와 동일 패턴).
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        setState({ status: "loading" });
        try {
          const result = await fetchAdminInquiries(
            { status: filter, page },
            controller.signal,
          );
          if (controller.signal.aborted) return;
          if (result.ok) {
            setState({
              status: "ready",
              inquiries: result.inquiries,
              total: result.total,
            });
          } else {
            setState({ status: "error", message: result.message });
          }
        } catch {
          // AbortError(언마운트/재요청)는 무시한다.
        }
      })();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [filter, page, reloadKey]);

  const handleFilterChange = useCallback((next: AdminInquiryStatusFilter) => {
    setFilter(next);
    setPage(1);
    setNotice(null);
    setOpenFormId(null);
  }, []);

  const handleToggleForm = useCallback((inquiry: AdminInquiry) => {
    setNotice(null);
    setOpenFormId((current) => {
      if (current === inquiry.id) {
        return null;
      }
      // 기존 답변이 있으면 수정 초안으로 채운다.
      setAnswerDraft(inquiry.answer ?? "");
      return inquiry.id;
    });
  }, []);

  const handleSaveAnswer = useCallback(
    async (inquiryId: string) => {
      setSavingId(inquiryId);
      setNotice(null);
      const result = await answerInquiry(inquiryId, answerDraft);
      setSavingId(null);
      if (result.ok) {
        setNotice({ tone: "success", message: result.message });
        setOpenFormId(null);
        // 저장된 답변·상태를 서버 기준으로 다시 읽는다(필터가 open이면 목록에서 빠진다).
        setReloadKey((key) => key + 1);
      } else {
        setNotice({ tone: "error", message: result.message });
      }
    },
    [answerDraft],
  );

  const inquiries = state.status === "ready" ? state.inquiries : null;
  const total = state.status === "ready" ? state.total : 0;
  const totalPages = Math.max(1, Math.ceil(total / INQUIRY_PAGE_SIZE));

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 lg:px-10">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <Link
            href="/admin"
            className="text-xs font-semibold text-accent-strong hover:underline"
          >
            ← 운영 관리
          </Link>
          <h1 className="text-2xl font-bold text-slate-950">문의 관리</h1>
          <p className="text-sm text-slate-600">
            고객 1:1 문의를 확인하고 답변합니다. 답변을 저장하면 고객 화면에
            바로 표시되며, 다시 저장하면 최신 답변으로 덮어씁니다.
          </p>
        </header>

        <div
          role="tablist"
          aria-label="문의 상태 필터"
          className="flex flex-wrap gap-2"
        >
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={filter === option.value}
              onClick={() => handleFilterChange(option.value)}
              className={`h-9 rounded-md border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                filter === option.value
                  ? "border-accent bg-accent text-white"
                  : "border-line-strong bg-white text-slate-600 hover:border-accent hover:text-accent-strong"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {notice ? (
          <p
            role="alert"
            className={`rounded-md border px-4 py-3 text-sm font-semibold ${noticeStyles[notice.tone]}`}
          >
            {notice.message}
          </p>
        ) : null}

        {state.status === "loading" ? (
          <AdminLoadingRow message="페이지를 불러오는 중입니다." />
        ) : null}

        {state.status === "error" ? (
          <p
            className="rounded-md border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error"
            role="alert"
          >
            {state.message}
          </p>
        ) : null}

        {inquiries && inquiries.length === 0 ? (
          <AdminEmptyState
            title="해당 조건의 문의가 없습니다"
            description="필터를 바꾸면 다른 상태의 문의를 볼 수 있습니다."
          />
        ) : null}

        {inquiries && inquiries.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {inquiries.map((inquiry) => {
              const isFormOpen = openFormId === inquiry.id;
              const isSaving = savingId === inquiry.id;
              return (
                <li
                  key={inquiry.id}
                  className="rounded-lg border border-line bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeStyles[inquiry.status]}`}
                      >
                        {inquiryStatusLabel[inquiry.status]}
                      </span>
                      <span className="text-xs text-slate-500">
                        {inquiry.userLabel}
                      </span>
                    </span>
                    <span className="text-xs text-slate-400">
                      {formatAdminDateTime(inquiry.createdAt)}
                    </span>
                  </div>

                  <h2 className="mt-2 text-sm font-bold text-slate-950">
                    {inquiry.title}
                  </h2>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                    {inquiry.body}
                  </p>

                  {inquiry.answer && !isFormOpen ? (
                    <div className="mt-3 rounded-md border border-accent/20 bg-accent-tint px-3 py-2.5">
                      <p className="text-xs font-semibold text-accent-strong">
                        답변
                        {inquiry.answeredAt
                          ? ` · ${formatAdminDateTime(inquiry.answeredAt)}`
                          : ""}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                        {inquiry.answer}
                      </p>
                    </div>
                  ) : null}

                  {isFormOpen ? (
                    <div className="mt-3 flex flex-col gap-2">
                      <label
                        htmlFor={`inquiry-answer-${inquiry.id}`}
                        className="text-xs font-semibold text-slate-500"
                      >
                        답변 내용 ({answerDraft.trim().length}/{INQUIRY_ANSWER_MAX}자)
                      </label>
                      <textarea
                        id={`inquiry-answer-${inquiry.id}`}
                        value={answerDraft}
                        onChange={(event) => {
                          setAnswerDraft(event.target.value);
                          setNotice(null);
                        }}
                        rows={4}
                        maxLength={INQUIRY_ANSWER_MAX}
                        disabled={isSaving}
                        className="w-full rounded-md border border-line-strong px-3 py-2 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:bg-slate-50"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleSaveAnswer(inquiry.id)}
                          disabled={isSaving || answerDraft.trim().length === 0}
                          className="h-9 rounded-md bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                        >
                          {isSaving ? (
                            <span className="inline-flex items-center gap-2">
                              <AdminButtonSpinner />
                              저장 중
                            </span>
                          ) : (
                            "답변 저장"
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setOpenFormId(null)}
                          disabled={isSaving}
                          className="h-9 rounded-md border border-line-strong px-4 text-sm font-semibold text-slate-600 transition hover:border-accent hover:text-accent-strong disabled:cursor-not-allowed disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          닫기
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleToggleForm(inquiry)}
                      className="mt-3 h-9 rounded-md border border-line-strong px-4 text-sm font-semibold text-slate-700 transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {inquiry.answer ? "답변 수정" : "답변 작성"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}

        {inquiries && total > 0 ? (
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1 || state.status !== "ready"}
              className="h-9 rounded-md border border-line-strong px-3 text-sm font-semibold text-slate-600 transition hover:border-accent hover:text-accent-strong disabled:cursor-not-allowed disabled:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              이전
            </button>
            <span className="text-sm font-semibold text-slate-700">
              {page} / {totalPages} 페이지 · 총 {total}건
            </span>
            <button
              type="button"
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
              disabled={page >= totalPages || state.status !== "ready"}
              className="h-9 rounded-md border border-line-strong px-3 text-sm font-semibold text-slate-600 transition hover:border-accent hover:text-accent-strong disabled:cursor-not-allowed disabled:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              다음
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
