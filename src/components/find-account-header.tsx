"use client";

// 아이디/비밀번호 찾기 흐름 공통 헤더. 구분선은 풀폭, 제목은 가운데, 우측 X 닫기.
// onClose가 없으면 닫기 버튼을 숨긴다(완료 화면 등).
export function FindAccountHeader({ onClose }: { onClose?: () => void }) {
  return (
    <header className="w-full border-b border-[#c9c9c9]">
      <div className="relative mx-auto flex h-[61px] w-full max-w-[520px] items-center justify-center px-5">
        <h1 className="text-[18px] font-bold text-[#252525]">아이디 / 비밀번호 찾기</h1>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="absolute right-5 flex items-center justify-center text-[#252525]"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 5l14 14M19 5L5 19" />
            </svg>
          </button>
        ) : null}
      </div>
    </header>
  );
}
