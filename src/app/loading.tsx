// 라우트 전환·초기 로딩 시 자동으로 노출되는 전역 로딩 화면(App Router Suspense fallback).
// fixed inset-0 오버레이로 화면 전체를 덮어 상단 네비/푸터를 가리고(로딩 중 잡요소 숨김),
// 중앙의 카드 안에서 두 원(빨강 + 브랜드 네이비)이 각자 좌↔우로 움직이며 자리를 맞바꾼다.

export default function Loading() {
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-background px-5"
      role="status"
      aria-live="polite"
    >
      <div className="flex w-full max-w-[300px] flex-col items-center rounded-2xl bg-white px-8 py-10 shadow-[0_4px_24px_rgba(145,155,185,0.18)]">
        {/* 두 원을 같은 중심에 겹쳐 두고 각각 반대 위상으로 좌우 이동시킨다.
            교차 시 빨강(z-10)이 항상 앞으로 지나간다. */}
        <div className="relative grid h-8 w-[68px] place-items-center" aria-hidden="true">
          <span className="z-10 col-start-1 row-start-1 size-8 animate-orbit-a rounded-full bg-[#e23b3b]" />
          <span className="col-start-1 row-start-1 size-8 animate-orbit-b rounded-full bg-accent" />
        </div>

        <p className="mt-7 text-[17px] font-bold text-[#252525]">
          페이지를 불러오는 중입니다.
        </p>
        <p className="mt-2 text-[14px] text-[#9b9b9b]">잠시만 기다려 주세요.</p>
      </div>
    </div>
  );
}
