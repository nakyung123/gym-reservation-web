"use client";

// 관리자 콘솔의 비동기 상태 표현을 한 곳에서 통일한다.
// 밀도는 콘솔 규격(admin-ui)을 따른다. 고객 화면보다 한 단계 작다.

// 비동기 로딩 중 표시. 스피너 + 안내 문구를 함께 둔다.
export function AdminLoadingRow({ message }: { message: string }) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-xl border border-line bg-white px-4 py-4 text-[13.5px] font-semibold text-muted"
      aria-live="polite"
      aria-busy="true"
    >
      <span
        className="size-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-accent"
        aria-hidden="true"
      />
      {message}
    </div>
  );
}

// 데이터가 없거나 아직 조회하지 않은 상태. "왜 비어 있는지 + 다음 행동"을 함께 안내한다.
export function AdminEmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-white p-8 text-center">
      <p className="text-[14px] font-bold text-foreground">{title}</p>
      {description ? (
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          {description}
        </p>
      ) : null}
    </div>
  );
}

// 버튼 안에서 쓰는 작은 스피너. 흰색 글자 버튼 위에 얹는 용도.
export function AdminButtonSpinner() {
  return (
    <span
      className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-white/40 border-t-white"
      aria-hidden="true"
    />
  );
}
