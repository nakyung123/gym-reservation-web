import type { ReactNode } from "react";

/**
 * 관리자 콘솔의 패널·표·컨트롤 SSOT.
 *
 * 고객 화면과 **의도적으로 다른 밀도**를 쓴다. 고객 화면은 읽는 화면(본문 15px·행 72px·게시판 표)이고
 * 콘솔은 조작하는 화면이라, 한 화면에 두 배의 행이 보여야 한다.
 *  - 본문 13.5px · 표 헤더 12px · 행 48px · 컨트롤 h-9
 *  - 카드: rounded-xl + border(그림자 없음). 캔버스(surface-2) 위에 흰 카드가 떠 있는 구조.
 * 색·폰트·accent 토큰은 고객 화면과 같은 SSOT를 그대로 쓴다(globals.css).
 */
export function AdminPanel({
  title,
  description,
  actions,
  children,
  className = "",
}: {
  /** 없으면 제목 줄 자체를 렌더하지 않는다(제목 없는 순수 컨테이너로도 쓴다). */
  title?: string;
  description?: string;
  /** 제목 우측에 놓을 버튼·필터 등. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-white p-4 sm:p-5 ${className}`}
    >
      {title || actions ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          {title ? (
            <div>
              <h2 className="text-[15px] font-bold text-foreground">{title}</h2>
              {description ? (
                <p className="mt-0.5 text-[12.5px] text-muted">{description}</p>
              ) : null}
            </div>
          ) : (
            <span />
          )}
          {actions ? (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** API/검증 실패 표시. No Silent Fallback — 실패는 항상 이 박스로 드러낸다. */
export function AdminErrorNotice({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-[13.5px] font-semibold text-error"
    >
      {message}
    </p>
  );
}

type Align = "left" | "center" | "right";

const ALIGN_CLASS: Record<Align, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

/**
 * 관리자 데이터 표.
 *
 * 고객 게시판 표(굵은 상단선·세로 구분선·18px·72px)와 **다른 어휘**를 쓴다.
 * 콘솔 표는 열이 5~9개라 세로 구분선 없이 가로선만 두고, 흰 카드 안에 담는다.
 * 이 값이 관리자 표의 SSOT다(화면마다 다시 정하지 않는다).
 */
export type AdminTableColumn = {
  /** 문자열이 보통이지만, 전체 선택 체크박스처럼 컨트롤이 들어갈 수도 있다. */
  label: ReactNode;
  /** label이 문자열이 아닐 때 필요한 React key. */
  key?: string;
  align?: Align;
  width?: string;
};

export function AdminTable({
  columns,
  children,
  minWidth = "min-w-[720px]",
  footer,
}: {
  columns: AdminTableColumn[];
  children: ReactNode;
  /** 좁은 화면에서 열이 겹치지 않도록 하는 최소 폭(가로 스크롤로 처리). */
  minWidth?: string;
  /** 표 아래 붙는 영역(페이지네이션·합계 등). 카드 안에 함께 담긴다. */
  footer?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="overflow-x-auto">
        <table className={`w-full ${minWidth}`}>
          <thead>
            <tr className="border-b border-line bg-surface-2 text-[12px] font-bold text-muted">
              {columns.map((column, index) => (
                <th
                  key={
                    column.key ??
                    (typeof column.label === "string"
                      ? column.label
                      : `col-${index}`)
                  }
                  scope="col"
                  className={`h-[42px] whitespace-nowrap px-3.5 ${
                    ALIGN_CLASS[column.align ?? "left"]
                  } ${column.width ?? ""}`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {footer ? <div className="border-t border-line">{footer}</div> : null}
    </div>
  );
}

/**
 * AdminTable 안의 셀. 행 구분선은 셀이 그린다.
 * 기본은 한 줄 셀(h-12, 세로 가운데). 내용이 2~3줄로 쌓이는 표는 valign="top"으로 늘어나게 둔다.
 */
export function AdminTd({
  children,
  align = "left",
  valign = "middle",
  numeric = false,
  className = "",
  colSpan,
}: {
  children: ReactNode;
  align?: Align;
  valign?: "middle" | "top";
  /** 숫자·금액·예약번호·일시 셀. JetBrains Mono tabular로 자릿수를 세로 정렬한다. */
  numeric?: boolean;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`border-t border-line px-3.5 text-[13.5px] text-foreground ${
        valign === "top" ? "py-3 align-top" : "h-12 align-middle"
      } ${ALIGN_CLASS[align]} ${numeric ? "admin-num" : ""} ${className}`}
    >
      {children}
    </td>
  );
}

/**
 * AdminTable의 행. hover·선택 강조는 여기서만 준다.
 * `selected`는 상세 패널이 열린 행처럼 "지금 보고 있는 행"을 가리킬 때 쓴다.
 * `align="top"`은 셀이 2~3줄로 쌓이는 표(슬롯·예약)에서 쓴다.
 */
export function AdminTr({
  children,
  selected = false,
  align = "middle",
}: {
  children: ReactNode;
  selected?: boolean;
  align?: "middle" | "top";
}) {
  return (
    <tr
      className={`transition ${align === "top" ? "align-top" : ""} ${
        selected ? "bg-accent-tint" : "hover:bg-surface-2/60"
      }`}
    >
      {children}
    </tr>
  );
}

/** 폼 필드 라벨(11.5px bold). 콘솔은 라벨보다 값이 커야 한다. */
export const ADMIN_FIELD_LABEL_CLASS =
  "text-[11.5px] font-bold text-muted";

/** 입력·셀렉트 트리거 공통 룩(h-9, radius 8px, 13px). */
export const ADMIN_CONTROL_CLASS =
  "h-9 rounded-lg border border-line-strong bg-white px-3 text-[13px] text-foreground transition focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:bg-surface-2";

/** 여러 줄 입력. 컨트롤과 같은 보더·radius·포커스 링을 쓰되 높이는 rows가 정한다. */
export const ADMIN_TEXTAREA_CLASS =
  "rounded-lg border border-line-strong bg-white px-3 py-2.5 text-[13px] font-normal leading-relaxed text-foreground transition placeholder:text-subtle focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:bg-surface-2";

/**
 * 토글형 필터 버튼(상태 탭·정렬).
 * 선택은 accent 틴트로 표현한다. 사이드바의 활성 메뉴(솔리드)와 위계를 구분하기 위해서다.
 */
export function adminToggleButtonClass(active: boolean): string {
  return `inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
    active
      ? "border-accent bg-accent-tint text-accent-strong"
      : "border-line-strong bg-white text-muted hover:border-accent hover:text-accent-strong"
  }`;
}
