import type { ReactNode } from "react";

/**
 * 마이페이지 즐겨찾기·문의 탭이 공유하는 KMI식 게시판 표.
 *  - 상단 굵은 라인 + 회색 헤더 행(번호/제목 등) + 행 hover.
 *  - 내역이 없으면 KMI VOC와 동일하게 ⚠ 아이콘 + 안내 문구를 가운데 표시한다.
 * 페이지네이션은 공용 BoardPagination을 부모에서 별도로 렌더한다(공지·FAQ와 공유).
 */
export type BoardColumn = {
  label: string;
  // table-fixed colgroup 너비 클래스(예: "w-[80px]"). 없으면 자동(가변 폭).
  width?: string;
  // 모바일에서 숨길 열(좁은 화면 가독성).
  hideOnMobile?: boolean;
  align?: "left" | "center";
};

export type BoardRow = {
  key: string;
  cells: ReactNode[];
};

function BoardWarnIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      aria-hidden="true"
      className={className ?? "size-8 text-foreground"}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5" strokeLinecap="round" />
      <path d="M12 16.2h.01" strokeLinecap="round" />
    </svg>
  );
}

export function MypageBoard({
  columns,
  rows,
  emptyMessage,
  // th/td 높이·폰트·빈상태 아이콘은 호출 패널이 지정한다(미지정 시 공통 기본값).
  headHeightClass = "h-[72px]",
  cellHeightClass = "h-[106px]",
  textClass = "text-[18px]",
  emptyIconClass = "size-10 text-foreground",
}: {
  columns: BoardColumn[];
  rows: BoardRow[];
  emptyMessage: string;
  headHeightClass?: string;
  cellHeightClass?: string;
  textClass?: string;
  emptyIconClass?: string;
}) {
  const isEmpty = rows.length === 0;

  return (
    <div className="border-t-2 border-foreground/80">
      {/* 모바일: 열이 좁아 글자가 겹치지 않도록 표에 최소 폭을 주고 가로 스크롤로 보완한다. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] table-fixed sm:min-w-0">
        <colgroup>
          {columns.map((column, index) => (
            <col
              key={index}
              className={`${column.width ?? ""} ${
                column.hideOnMobile ? "hidden sm:table-column" : ""
              }`}
            />
          ))}
        </colgroup>
        <thead>
          {/* KMI VOC 실측: th bg #F8F8F8, near-black, 600 weight, 가운데. 높이·폰트는 prop. */}
          <tr className="border-b border-line bg-surface-2">
            {columns.map((column, index) => (
              <th
                key={index}
                scope="col"
                className={`${headHeightClass} px-3 ${textClass} font-semibold text-foreground ${
                  index > 0 ? "border-l border-line" : ""
                } ${column.align === "left" ? "text-left" : "text-center"} ${
                  column.hideOnMobile ? "hidden sm:table-cell" : ""
                }`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        {!isEmpty ? (
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                className="border-b border-line transition-colors hover:bg-surface-2"
              >
                {row.cells.map((cell, index) => (
                  <td
                    key={index}
                    className={`${cellHeightClass} px-3 align-middle ${textClass} text-foreground ${
                      index > 0 ? "border-l border-line" : ""
                    } ${
                      columns[index]?.align === "left"
                        ? "text-left"
                        : "text-center"
                    } ${columns[index]?.hideOnMobile ? "hidden sm:table-cell" : ""}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ) : null}
        </table>
      </div>

      {isEmpty ? (
        // 빈 표 영역: 아이콘(40px) + 안내 문구를 가운데.
        <div className="flex h-[106px] flex-col items-center justify-center gap-1.5 border-b border-line">
          <BoardWarnIcon className={emptyIconClass} />
          <p className="text-[18px] font-normal text-foreground">
            {emptyMessage}
          </p>
        </div>
      ) : null}
    </div>
  );
}
