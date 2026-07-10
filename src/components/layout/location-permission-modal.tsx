"use client";

import { useTranslations } from "next-intl";
import { useUserLocation } from "@/hooks/use-user-location";

// 위치 권한 안내/요청 모달. 다음 케이스를 구분해 메시지를 분기한다:
// - denied: 사용자가 권한을 거부했거나 브라우저 설정에서 차단한 상태. "허용하기" 노출 X.
// - lastError=unavailable: 기기 위치 서비스가 꺼져 있거나 좌표를 받을 수 없는 상태.
// - lastError=timeout: 위치 응답이 시간 안에 오지 않음.
// - 그 외 (prompt 등): 표준 동의 안내.

type ModalError = "unavailable" | "timeout" | "unsupported" | null;

// 헬퍼에 넘기는 번역 함수는 key→string 호출 시그니처로만 사용한다.
type ModalTranslate = (key: string) => string;

function getTitle(
  t: ModalTranslate,
  isDenied: boolean,
  lastError: ModalError,
): string {
  if (isDenied) return t("titleDenied");
  if (lastError === "unsupported") return t("titleUnsupported");
  if (lastError === "unavailable") return t("titleUnavailable");
  if (lastError === "timeout") return t("titleTimeout");
  return t("titleDefault");
}

function getBody(
  t: ModalTranslate,
  isDenied: boolean,
  lastError: ModalError,
): string {
  if (isDenied) return t("bodyDenied");
  if (lastError === "unsupported") return t("bodyUnsupported");
  if (lastError === "unavailable") return t("bodyUnavailable");
  if (lastError === "timeout") return t("bodyTimeout");
  return t("bodyDefault");
}

export function LocationPermissionModal() {
  const t = useTranslations("LocationModal");
  const { permission, lastError, isPromptModalOpen, requestLocation, closePromptModal } =
    useUserLocation();

  if (!isPromptModalOpen) return null;

  const isDenied = permission === "denied";
  // denied/unsupported에서는 재시도 버튼이 의미가 없다. 그 외(prompt/unavailable/timeout)는 재시도 가능.
  const showRetry = !isDenied && lastError !== "unsupported";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="location-permission-title"
    >
      <div className="w-full max-w-sm rounded-lg border border-line bg-white p-6 shadow-xl">
        <h2
          id="location-permission-title"
          className="text-lg font-bold text-slate-950"
        >
          {getTitle(t, isDenied, lastError)}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          {getBody(t, isDenied, lastError)}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={closePromptModal}
            className="inline-flex h-10 items-center justify-center rounded-md border border-line-strong bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
          >
            {isDenied ? t("confirm") : t("later")}
          </button>
          {showRetry ? (
            <button
              type="button"
              onClick={() => {
                void requestLocation();
              }}
              className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover"
            >
              {lastError ? t("retry") : t("allow")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
