import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

/**
 * 버튼 룩의 SSOT. 색/보더는 variant, 높이·패딩·글자 크기는 size에서만 정의한다.
 * 버튼 크기나 모양을 전역적으로 바꾸려면 아래 두 맵(variantClass/sizeClass)만
 * 고치면 이 컴포넌트를 쓰는 모든 화면이 따라온다. (구조 유연성 우선)
 *
 * - <Button>     : 액션 버튼(onClick 등). 클라이언트 부모에서 핸들러를 내려준다.
 * - <ButtonLink> : 이동(Next Link). Server/Client 어디서나 사용 가능.
 */
export type ButtonVariant =
  | "primary"
  | "outline"
  | "ghost"
  | "danger"
  | "danger-outline";
/**
 * xs·console은 관리자 콘솔 전용 밀도다(고객 화면은 md/lg를 쓴다).
 *  - console: 콘솔의 기본 버튼(조회·저장 등). 컨트롤(h-9)과 높이를 맞춘다.
 *  - xs     : 표 안 인라인 액션(이용 완료·취소). 행 높이 48px 안에 들어가야 한다.
 */
export type ButtonSize = "xs" | "console" | "sm" | "md" | "lg";

const baseClass =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

const variantClass: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover",
  outline:
    "border border-line-strong bg-white text-foreground hover:border-accent hover:text-accent-strong",
  ghost: "text-muted hover:bg-surface-2 hover:text-foreground",
  // 파괴적 액션(예약 취소·삭제). AGENTS.md § Tailwind 패턴의 destructive 규칙.
  danger: "bg-error text-white hover:bg-error/90",
  "danger-outline":
    "border border-error/30 bg-white text-error hover:bg-error/10",
};

const sizeClass: Record<ButtonSize, string> = {
  xs: "h-7 gap-1.5 rounded-md px-2.5 text-[12px]",
  console: "h-9 px-3.5 text-[13px]",
  sm: "h-9 px-[14px] text-[14.5px]",
  md: "h-11 px-[19px] text-[15.5px]",
  lg: "h-12 px-7 text-[16.5px]",
};

function composeButtonClass(
  variant: ButtonVariant,
  size: ButtonSize,
  className?: string,
) {
  return [baseClass, variantClass[variant], sizeClass[size], className]
    .filter(Boolean)
    .join(" ");
}

type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  variant = "primary",
  size = "md",
  type = "button",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={composeButtonClass(variant, size, className)}
      {...props}
    />
  );
}

type ButtonLinkProps = ComponentPropsWithoutRef<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={composeButtonClass(variant, size, className)} {...props} />
  );
}
