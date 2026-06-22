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

function BoardWarnIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden="true"
      className="size-8 text-foreground"
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
}: {
  columns: BoardColumn[];
  rows: BoardRow[];
  emptyMessage: string;
}) {
  const isEmpty = rows.length === 0;

  return (
    <div className="border-t-2 border-foreground/80">
      <table className="w-full table-fixed">
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
          {/* KMI VOC 실측: th bg #F8F8F8, near-black, 16~18px/600, 높이 72px, 가운데 */}
          <tr className="border-b border-line bg-surface-2">
            {columns.map((column, index) => (
              <th
                key={index}
                scope="col"
                className={`h-[60px] px-3 text-[15px] font-semibold text-foreground sm:h-[68px] sm:text-[16px] ${
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
                    className={`h-[60px] px-3 align-middle text-[15px] text-foreground ${
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

      {isEmpty ? (
        // 빈 표 영역: 그림판 지시 #1(높이 86px) + #6(아이콘↔문구 간격 축소).
        <div className="flex h-[86px] flex-col items-center justify-center gap-1.5 border-b border-line">
          <BoardWarnIcon />
          <p className="text-[16px] font-normal text-foreground">
            {emptyMessage}
          </p>
        </div>
      ) : null}
    </div>
  );
}
