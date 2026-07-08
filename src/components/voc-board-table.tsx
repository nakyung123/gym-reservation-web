"use client";

import { Fragment, useState } from "react";
import { verifyVocPost } from "@/lib/voc-client";
import { VOC_CATEGORY_LABELS } from "@/lib/domain-constants";
import type { Gym, VocPost } from "@/types/domain";

// 공개 문의 게시판 표(클라이언트). 각 행을 누르면 별도 페이지로 이동하지 않고
// 그 행 바로 아래로 인라인 패널이 펼쳐진다.
//  - 처음엔 비밀번호 게이트, 인증 성공하면 같은 자리에서 센터/분류/문의 상세로 바뀐다.
//  - 다른 행을 누르면 이전 패널은 접히고(언마운트) 입력 상태가 초기화된다.

const PAGE_SIZE = 10;

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-[18px] shrink-0 text-slate-500"
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function VocBoardTable({
  posts,
  total,
  page,
  gyms,
}: {
  posts: VocPost[];
  total: number;
  page: number;
  gyms: Gym[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const gymNameById = new Map(gyms.map((gym) => [gym.id, gym.name]));

  return (
    <div className="mx-auto mt-4 w-full max-w-[1400px] border-t-2 border-foreground/80">
      {/* 모바일: 5열이 좁아 글자가 겹치지 않도록 최소 폭 + 가로 스크롤(마이페이지 보드와 동일 패턴). */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] table-fixed sm:min-w-0">
        <colgroup>
          <col className="w-[14%]" />
          <col className="w-[18%]" />
          <col className="w-[40%]" />
          <col className="w-[14%]" />
          <col className="w-[14%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-line bg-surface-2 text-[18px] font-bold text-foreground">
            <th scope="col" className="h-[72px] px-3">
              번호
            </th>
            <th scope="col" className="h-[72px] border-l border-line px-3">
              체육관
            </th>
            <th scope="col" className="h-[72px] border-l border-line px-3">
              제목
            </th>
            <th scope="col" className="h-[72px] border-l border-line px-3">
              성명
            </th>
            <th scope="col" className="h-[72px] border-l border-line px-3">
              등록일
            </th>
          </tr>
        </thead>
        <tbody>
          {posts.length === 0 ? (
            <tr className="border-b border-line">
              <td
                colSpan={5}
                className="h-[120px] text-center text-[16px] text-muted"
              >
                등록된 문의가 없습니다.
              </td>
            </tr>
          ) : (
            posts.map((post, index) => {
              const isOpen = expandedId === post.id;
              // 체육관은 작성 시 필수 선택이라 항상 실제 체육관명이다('전체' 없음).
              const gymName = post.gymId
                ? (gymNameById.get(post.gymId) ?? "-")
                : "-";
              return (
                <Fragment key={post.id}>
                  <tr
                    onClick={() =>
                      setExpandedId((prev) => (prev === post.id ? null : post.id))
                    }
                    aria-expanded={isOpen}
                    className="group cursor-pointer border-b border-line transition-colors hover:bg-surface-2"
                  >
                    <td className="h-[72px] px-3 text-center align-middle text-[18px] tabular-nums text-muted">
                      {total - ((page - 1) * PAGE_SIZE + index)}
                    </td>
                    <td className="h-[72px] border-l border-line px-3 text-center align-middle text-[18px] text-foreground">
                      {/* 전역 keep-all로 긴 시설명이 셀을 넘치지 않도록 말줄임 처리 */}
                      <span className="block truncate">{gymName}</span>
                    </td>
                    <td className="h-[72px] border-l border-line pl-[19px] pr-3 align-middle text-[18px]">
                      <span className="flex items-center gap-2 text-foreground transition group-hover:text-accent-strong">
                        <LockIcon />
                        {/* 목록 제목은 '문의합니다'로 통일. 실제 분류는 글을 열어야 확인된다. */}
                        <span className="truncate">
                          {VOC_CATEGORY_LABELS.inquiry}
                        </span>
                      </span>
                    </td>
                    <td className="h-[72px] border-l border-line px-3 text-center align-middle text-[18px] text-foreground">
                      {post.authorName}
                    </td>
                    <td className="h-[72px] border-l border-line px-3 text-center align-middle text-[18px] tabular-nums text-muted">
                      {formatDate(post.createdAt)}
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr>
                      <td colSpan={5} className="border-b border-line p-0">
                        <VocInlinePanel
                          id={post.id}
                          gymNameById={gymNameById}
                          onClose={() => setExpandedId(null)}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })
          )}
        </tbody>
        </table>
      </div>
    </div>
  );
}

type PanelState =
  | { kind: "gate" }
  | { kind: "verifying" }
  | { kind: "error"; message: string }
  | { kind: "unlocked"; post: VocPost };

// 한 행 아래에 펼쳐지는 인라인 패널: 비밀번호 게이트 → 인증 성공 시 상세.
function VocInlinePanel({
  id,
  gymNameById,
  onClose,
}: {
  id: string;
  gymNameById: Map<string, string>;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [state, setState] = useState<PanelState>({ kind: "gate" });

  const handleVerify = async () => {
    if (!/^\d{4}$/.test(password)) {
      setState({ kind: "error", message: "숫자 4자리 비밀번호를 입력해 주세요." });
      return;
    }
    setState({ kind: "verifying" });
    const result = await verifyVocPost(id, password);
    if (result.ok) {
      setState({ kind: "unlocked", post: result.post });
      return;
    }
    setState({ kind: "error", message: result.message });
  };

  if (state.kind === "unlocked") {
    const { post } = state;
    const gymName = post.gymId ? (gymNameById.get(post.gymId) ?? "-") : "-";
    return (
      <div>
        <DetailRow label="체육관" height="min-h-[72px]">
          {gymName}
        </DetailRow>
        <DetailRow label="분류" height="min-h-[72px]">
          {VOC_CATEGORY_LABELS[post.category]}
        </DetailRow>
        <DetailRow label="문의" height="min-h-[221px]" alignTop>
          <span className="whitespace-pre-line leading-relaxed">{post.body}</span>
        </DetailRow>
      </div>
    );
  }

  const isVerifying = state.kind === "verifying";

  // 비밀번호 인증 폼(행 아래 인라인).
  return (
    <div className="flex flex-col items-center justify-center gap-[30px] bg-surface-2 px-10 py-10">
      <p className="text-[18px] font-medium text-slate-800">
        비밀번호를 입력해 주세요.
      </p>
      <div className="flex flex-col items-center">
        <input
          type="password"
          inputMode="numeric"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value.replace(/\D/g, "").slice(0, 4));
            if (state.kind === "error") setState({ kind: "gate" });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleVerify();
            }
          }}
          maxLength={4}
          placeholder="숫자 4자리 입력해주세요"
          disabled={isVerifying}
          aria-label="비밀번호"
          className="h-[56px] w-[249px] max-w-full rounded-[12px] border border-line-strong bg-white pl-4 pr-3.5 text-left text-[16px] text-slate-950 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        {state.kind === "error" ? (
          <p role="alert" className="mt-2 text-[13px] font-semibold text-error">
            {state.message}
          </p>
        ) : null}
      </div>
      <div className="flex gap-3.5">
        <button
          type="button"
          onClick={handleVerify}
          disabled={isVerifying}
          className="inline-flex h-[40px] w-[100px] items-center justify-center rounded-full bg-accent text-[14px] font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          {isVerifying ? "확인 중…" : "확인"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-[40px] w-[100px] items-center justify-center rounded-full border border-line-strong bg-white text-[14px] font-semibold text-slate-700 transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          취소
        </button>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  height,
  alignTop = false,
  children,
}: {
  label: string;
  height: string;
  alignTop?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[14%_1fr] border-b border-line last:border-b-0">
      <div
        className={`flex ${height} items-center justify-center bg-surface-2 px-3 text-[18px] font-semibold text-foreground`}
      >
        {label}
      </div>
      <div
        className={`flex ${height} ${alignTop ? "items-start py-5" : "items-center"} border-l border-line bg-surface-2 px-4 text-[18px] text-foreground`}
      >
        {children}
      </div>
    </div>
  );
}
