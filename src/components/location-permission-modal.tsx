"use client";

import { useUserLocation } from "@/hooks/use-user-location";

// 위치 권한 안내/요청 모달. 다음 케이스를 구분해 메시지를 분기한다:
// - denied: 사용자가 권한을 거부했거나 브라우저 설정에서 차단한 상태. "허용하기" 노출 X.
// - lastError=unavailable: 기기 위치 서비스가 꺼져 있거나 좌표를 받을 수 없는 상태.
// - lastError=timeout: 위치 응답이 시간 안에 오지 않음.
// - 그 외 (prompt 등): 표준 동의 안내.

type ModalError = "unavailable" | "timeout" | "unsupported" | null;

function getTitle(isDenied: boolean, lastError: ModalError): string {
  if (isDenied) return "위치 권한이 차단되어 있습니다";
  if (lastError === "unsupported") return "이 브라우저는 위치 정보를 지원하지 않습니다";
  if (lastError === "unavailable") return "위치 정보를 가져올 수 없습니다";
  if (lastError === "timeout") return "위치 응답이 늦어졌습니다";
  return "위치 정보 사용 동의";
}

function getBody(isDenied: boolean, lastError: ModalError): string {
  if (isDenied) {
    return "거리순 정렬과 거리 표시를 위해 위치 정보가 필요합니다. 주소창 좌측 자물쇠 아이콘에서 위치 권한을 허용한 뒤 다시 시도해 주세요.";
  }
  if (lastError === "unsupported") {
    return "현재 사용 중인 브라우저에서 위치 정보 API(geolocation)를 지원하지 않습니다. 위치 기반 기능 없이 서비스를 계속 이용하실 수 있습니다.";
  }
  if (lastError === "unavailable") {
    return "기기의 위치 서비스가 꺼져 있거나 좌표를 가져올 수 없습니다. 위치 서비스를 켠 뒤 다시 시도해 주세요.";
  }
  if (lastError === "timeout") {
    return "위치 응답이 너무 늦었습니다. 잠시 후 다시 시도해 주세요.";
  }
  return "현재 위치를 기준으로 가까운 체육관을 찾고 거리를 표시하기 위해 위치 정보가 필요합니다. 위치 정보는 기기 안에서만 사용되며 저장하지 않습니다.";
}

export function LocationPermissionModal() {
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
          {getTitle(isDenied, lastError)}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          {getBody(isDenied, lastError)}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={closePromptModal}
            className="inline-flex h-10 items-center justify-center rounded-md border border-line-strong bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
          >
            {isDenied ? "확인" : "나중에"}
          </button>
          {showRetry ? (
            <button
              type="button"
              onClick={() => {
                void requestLocation();
              }}
              className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover"
            >
              {lastError ? "다시 시도" : "허용하기"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
