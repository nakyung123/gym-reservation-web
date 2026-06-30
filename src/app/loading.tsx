// 라우트 전환·초기 로딩 시 자동으로 노출되는 전역 로딩 화면(App Router Suspense fallback).
// 두 원(빨강 + 브랜드 네이비)이 중심을 기준으로 회전하며 서로 위치를 바꾼다(CSS animate-spin).

export default function Loading() {
  return (
    <div
      className="grid min-h-[70vh] place-items-center px-5"
      role="status"
      aria-live="polite"
    >
      <div className="flex w-full max-w-[300px] flex-col items-center rounded-2xl bg-white px-8 py-10 shadow-[0_4px_24px_rgba(145,155,185,0.18)]">
        {/* 두 원 회전: 컨테이너를 회전시키면 좌·우 원이 중심을 돌며 위치를 바꾼다. */}
        <div className="relative h-8 w-14 animate-spin [animation-duration:1.1s]" aria-hidden="true">
          <span className="absolute left-0 top-1/2 size-8 -translate-y-1/2 rounded-full bg-[#e23b3b]" />
          <span className="absolute right-0 top-1/2 size-8 -translate-y-1/2 rounded-full bg-accent" />
        </div>

        <p className="mt-7 text-[17px] font-bold text-[#252525]">
          페이지를 불러오는 중 입니다.
        </p>
        <p className="mt-2 text-[14px] text-[#9b9b9b]">잠시만 기다려 주세요.</p>
      </div>
    </div>
  );
}
