"use client";

import { useEffect } from "react";

// 앱 공용 알림창(SSOT). 사용자에게 단순 안내를 띄우는 모달.
//  - 예약 폼(종목 미선택 등), QR 체크인(이용 30분 전 안내) 등 모든 단순 알림을 이 컴포넌트로 통일한다.
//  - 제목 '알림' + 메시지 + 확인 버튼. 바깥 클릭/Esc/확인으로 닫는다.
export function AlertModal({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-black/40 px-5"
      role="dialog"
      aria-modal="true"
      aria-label="알림"
      onClick={onClose}
    >
      <div
        className="flex h-[186px] w-[312px] flex-col items-center justify-center rounded-2xl bg-white px-6 text-center shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-[20px] font-bold text-slate-900">알림</p>
        <p className="mt-3 text-[16px] text-slate-900">{message}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 text-[14px] font-medium text-accent-strong focus-visible:underline focus-visible:outline-none"
        >
          확인
        </button>
      </div>
    </div>
  );
}
