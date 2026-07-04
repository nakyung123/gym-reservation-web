"use client";

import { Fragment, useMemo, useState } from "react";
import { VOC_CATEGORY_LABELS } from "@/lib/domain-constants";
import type { Gym, VocPost } from "@/types/domain";

// 마이페이지 문의 내역 표(클라이언트). 내가 공개 게시판에 등록한 글 목록.
//  - 문의 게시판 표와 동일한 열 구성/너비(번호14·체육관18·제목40·성명14·등록일14).
//  - 행을 누르면 그 아래로 펼쳐져 체육관/카테고리/답변을 보여준다(본인 글이라 비밀번호는 없음).
//  - 답변 기능은 아직 없어 항상 '답변을 작성하는 중입니다.' 안내를 노출한다.

const PAGE_SIZE = 10;

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function MypageInquiriesTable({
  posts,
  gyms,
  total,
  page,
  emptyMessage,
}: {
  posts: VocPost[];
  gyms: Gym[];
  total: number;
  page: number;
  emptyMessage: string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const gymNameById = useMemo(
    () => new Map(gyms.map((gym) => [gym.id, gym.name])),
    [gyms],
  );

  return (
    <div className="w-full border-t-2 border-foreground/80">
      <table className="w-full table-fixed">
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
                {emptyMessage}
              </td>
            </tr>
          ) : (
            posts.map((post, index) => {
              const isOpen = expandedId === post.id;
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
                    <td className="h-[88px] px-3 text-center align-middle text-[18px] tabular-nums text-muted">
                      {total - ((page - 1) * PAGE_SIZE + index)}
                    </td>
                    <td className="h-[88px] border-l border-line px-3 text-center align-middle text-[18px] text-foreground">
                      {gymName}
                    </td>
                    <td className="h-[88px] border-l border-line px-3 text-center align-middle text-[18px]">
                      <span className="text-foreground transition group-hover:text-accent-strong">
                        문의합니다.
                      </span>
                    </td>
                    <td className="h-[88px] border-l border-line px-3 text-center align-middle text-[18px] text-foreground">
                      {post.authorName}
                    </td>
                    <td className="h-[88px] border-l border-line px-3 text-center align-middle text-[18px] tabular-nums text-muted">
                      {formatDate(post.createdAt)}
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr>
                      <td colSpan={5} className="border-b border-line p-0">
                        <DetailRow label="체육관" height="min-h-[72px]">
                          {gymName}
                        </DetailRow>
                        <DetailRow label="카테고리" height="min-h-[72px]">
                          {`${VOC_CATEGORY_LABELS[post.category]}.`}
                        </DetailRow>
                        <AnswerRow />
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
  );
}

// 체육관/카테고리 행: 좌측 회색 라벨 + 우측 회색 내용(문의 게시판 상세와 동일 톤).
function DetailRow({
  label,
  height,
  children,
}: {
  label: string;
  height: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[14%_1fr] border-b border-line">
      <div
        className={`flex ${height} items-center justify-center bg-surface-2 px-3 text-[18px] font-semibold text-foreground`}
      >
        {label}
      </div>
      <div
        className={`flex ${height} items-center border-l border-line bg-surface-2 px-4 text-[18px] text-foreground`}
      >
        {children}
      </div>
    </div>
  );
}

// 답변 행: 연한 파랑 배경 + 네이비 알약 라벨. 답변 기능 도입 전까지 안내 문구를 노출한다.
function AnswerRow() {
  return (
    <div className="grid grid-cols-[14%_1fr] bg-[#eef3fc]">
      <div className="flex min-h-[88px] items-center justify-center px-3">
        <span className="inline-flex h-[37px] w-[85px] items-center justify-center rounded-full bg-accent text-[15px] font-semibold text-white">
          답변
        </span>
      </div>
      <div className="flex min-h-[88px] items-center px-4 text-[18px] text-muted">
        답변을 작성하는 중입니다.
      </div>
    </div>
  );
}
