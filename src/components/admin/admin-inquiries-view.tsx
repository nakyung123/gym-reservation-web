"use client";

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
import {
  ADMIN_FIELD_LABEL_CLASS,
  AdminErrorNotice,
  AdminPanel,
  adminToggleButtonClass as filterButtonClass,
} from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/app-button";
import { BoardPagination } from "@/components/ui/board-pagination";
import { useBoardPaginationLabels } from "@/hooks/use-board-pagination-labels";
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
  const paginationLabels = useBoardPaginationLabels();
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
    <div className="flex flex-col gap-6">
      <AdminPanel>
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
              className={filterButtonClass(filter === option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </AdminPanel>

      {notice ? (
        <p
          role="alert"
          className={`rounded-xl border px-5 py-3.5 text-[13.5px] font-semibold ${noticeStyles[notice.tone]}`}
        >
          {notice.message}
        </p>
      ) : null}

      {state.status === "loading" ? (
        <AdminLoadingRow message="페이지를 불러오는 중입니다." />
      ) : null}

      {state.status === "error" ? (
        <AdminErrorNotice message={state.message} />
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
                className="rounded-xl border border-line bg-white p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[12.5px] font-bold ${statusBadgeStyles[inquiry.status]}`}
                    >
                      {inquiryStatusLabel[inquiry.status]}
                    </span>
                    <span className="text-[13px] text-muted">
                      {inquiry.userLabel}
                    </span>
                  </span>
                  <span className="text-[13px] tabular-nums text-muted">
                    {formatAdminDateTime(inquiry.createdAt)}
                  </span>
                </div>

                <h2 className="mt-3 text-[15px] font-bold text-foreground">
                  {inquiry.title}
                </h2>
                <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-foreground">
                  {inquiry.body}
                </p>

                {inquiry.answer && !isFormOpen ? (
                  <div className="mt-4 rounded-xl border border-accent/20 bg-accent-tint px-4 py-3">
                    <p className="text-[12.5px] font-bold text-accent-strong">
                      답변
                      {inquiry.answeredAt
                        ? ` · ${formatAdminDateTime(inquiry.answeredAt)}`
                        : ""}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-foreground">
                      {inquiry.answer}
                    </p>
                  </div>
                ) : null}

                {isFormOpen ? (
                  <div className="mt-4 flex flex-col gap-1.5">
                    <label
                      htmlFor={`inquiry-answer-${inquiry.id}`}
                      className={ADMIN_FIELD_LABEL_CLASS}
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
                      className="w-full rounded-[10px] border border-line-strong bg-white px-3.5 py-3 text-[13.5px] leading-relaxed text-foreground transition focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:bg-surface-2"
                    />
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        onClick={() => void handleSaveAnswer(inquiry.id)}
                        disabled={isSaving || answerDraft.trim().length === 0}
                      >
                        {isSaving ? (
                          <>
                            <AdminButtonSpinner />
                            저장 중
                          </>
                        ) : (
                          "답변 저장"
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setOpenFormId(null)}
                        disabled={isSaving}
                      >
                        닫기
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => handleToggleForm(inquiry)}
                    >
                      {inquiry.answer ? "답변 수정" : "답변 작성"}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {inquiries && total > 0 ? (
        <div className="flex flex-col items-center gap-1">
          <BoardPagination
            page={page}
            totalPages={totalPages}
            onNavigate={(next) => setPage(next)}
            labels={paginationLabels}
            spacing="compact"
          />
          <p className="text-[12.5px] tabular-nums text-muted">
            총 {total}건
          </p>
        </div>
      ) : null}
    </div>
  );
}
