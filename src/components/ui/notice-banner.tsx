import type { ReactNode } from "react";

/**
 * 성공/오류 알림 배너 SSOT.
 *
 * 같은 의미의 상태는 같은 문구·색으로 표현한다(AGENTS.md Consistency).
 * 기존에 mypage-view와 admin 뷰가 각자 noticeStyles를 들고 있던 것을 통합한다.
 * role은 접근성 규칙에 따라 자동 결정: error → alert, success → status.
 */
export type NoticeTone = "success" | "error";

const toneStyles: Record<NoticeTone, string> = {
  success: "border-success/30 bg-success/10 text-success",
  error: "border-error/30 bg-error/10 text-error",
};

export function NoticeBanner({
  tone,
  children,
  className = "",
}: {
  tone: NoticeTone;
  children: ReactNode;
  /** 배치용 여백(mb-* 등)만 추가한다. 색·패딩은 이 컴포넌트가 SSOT. */
  className?: string;
}) {
  return (
    <div
      className={`rounded-md border px-4 py-3 text-sm font-semibold ${toneStyles[tone]} ${className}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
