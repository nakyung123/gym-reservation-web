"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

// 앱 공용 알림창(SSOT). 사용자에게 단순 안내를 띄우는 모달.
//  - 예약 폼(종목 미선택 등), QR 체크인(이용 30분 전 안내) 등 모든 단순 알림을 이 컴포넌트로 통일한다.
//  - 제목 '알림' + 메시지 + 확인 버튼. 바깥 클릭/Esc/확인으로 닫는다.
//  - confirm을 넘기면 확인/취소 2지선다로 동작한다(네모 버튼 없이 텍스트 버튼을 가운데
//    정렬로 좌우 분할). 예: 예약 취소 확인. onClose가 '닫기'(취소)를 겸한다.
type AlertModalConfirm = {
  // 실행(우측) 버튼 라벨. 예: "예약 취소".
  confirmLabel: string;
  onConfirm: () => void;
  // 처리 중이면 실행 버튼을 비활성화하고 라벨을 대체한다.
  busy?: boolean;
  busyLabel?: string;
};

export function AlertModal({
  message,
  onClose,
  confirm,
}: {
  message: string;
  onClose: () => void;
  confirm?: AlertModalConfirm;
}) {
  const t = useTranslations("Common");
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const busy = confirm?.busy ?? false;

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-black/40 px-5"
      role="dialog"
      aria-modal="true"
      aria-label={t("alertTitle")}
      onClick={busy ? undefined : onClose}
    >
      <div
        className="flex min-h-[186px] w-[312px] flex-col items-center justify-center rounded-2xl bg-white px-6 py-7 text-center shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-[20px] font-bold text-slate-900">
          {t("alertTitle")}
        </p>
        <p className="mt-3 text-[16px] text-slate-900">{message}</p>
        {confirm ? (
          <div className="mt-6 flex w-full items-center justify-center gap-10">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="text-[14px] font-medium text-slate-500 transition disabled:opacity-50 focus-visible:underline focus-visible:outline-none"
            >
              {t("close")}
            </button>
            <button
              type="button"
              onClick={confirm.onConfirm}
              disabled={busy}
              className="text-[14px] font-medium text-accent-strong transition disabled:opacity-50 focus-visible:underline focus-visible:outline-none"
            >
              {busy ? confirm.busyLabel ?? t("processing") : confirm.confirmLabel}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="mt-6 text-[14px] font-medium text-accent-strong focus-visible:underline focus-visible:outline-none"
          >
            {t("confirm")}
          </button>
        )}
      </div>
    </div>
  );
}
