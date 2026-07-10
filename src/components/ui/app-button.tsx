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
export type ButtonVariant = "primary" | "outline" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const baseClass =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

const variantClass: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover",
  outline:
    "border border-line-strong bg-white text-foreground hover:border-accent hover:text-accent-strong",
  ghost: "text-muted hover:bg-surface-2 hover:text-foreground",
};

const sizeClass: Record<ButtonSize, string> = {
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
