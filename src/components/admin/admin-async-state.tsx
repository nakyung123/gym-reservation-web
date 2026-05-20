"use client";

// 관리자 화면(예약/시설/슬롯/운영 요약)의 비동기 상태 표현을 한 곳에서 통일한다.
// 로딩/빈 상태가 화면마다 다른 plain text로 흩어져 있던 것을 같은 컴포넌트로 모은다.
// 오류 상태는 화면별 문맥(notice 등)이 달라 각 화면의 rose 박스를 그대로 둔다.

// 비동기 로딩 중 표시. 스피너 + 안내 문구를 함께 둔다.
export function AdminLoadingRow({ message }: { message: string }) {
  return (
    <div
      className="mt-4 flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-6 text-sm font-semibold text-slate-600"
      aria-live="polite"
      aria-busy="true"
    >
      <span
        className="size-5 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-sky-600"
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
    <div className="mt-4 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {description ? (
        <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
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
