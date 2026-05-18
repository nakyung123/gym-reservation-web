"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { GeoPoint } from "@/lib/distance";

// 위치 권한 / 좌표를 앱 전역에서 공유한다. localStorage 등에는 저장하지 않고
// 세션 메모리에만 보관한다 (정확도 갱신 + 개인정보).

export type LocationPermissionState =
  // 아직 확인 전 (브라우저 permissions API 미지원이면 unknown으로 둠).
  | "unknown"
  // 사용자가 아직 허용/거부를 결정하지 않음.
  | "prompt"
  // 허용됨 + 좌표 받음.
  | "granted"
  // 사용자가 거부 또는 브라우저 설정에서 차단.
  | "denied";

// 권한이 거부가 아닌 이유로 위치를 못 받은 경우.
// - unavailable: 기기 위치 서비스 OFF, 좌표 조회 자체 실패 (PositionError code 2)
// - timeout: 위치 응답이 시간 안에 오지 않음 (PositionError code 3)
// - unsupported: 브라우저가 geolocation API 자체를 지원하지 않음
// 모달 메시지를 정확히 분기하기 위해 별도로 보관한다.
export type LocationLastError = "unavailable" | "timeout" | "unsupported" | null;

type UserLocationContextValue = {
  permission: LocationPermissionState;
  // 마지막으로 받은 사용자 좌표. 권한 거부/미요청이면 null.
  location: GeoPoint | null;
  // 마지막 위치 요청에서 발생한 비-권한 에러. denied 와 분리되어야 안내 메시지가 정확해진다.
  lastError: LocationLastError;
  // 권한 안내 모달이 열려 있는지 (앱 전역).
  isPromptModalOpen: boolean;
  // 위치 요청을 시작한다. 성공 시 location 설정. denied 등으로 실패 시 모달 유지.
  requestLocation: () => Promise<void>;
  // 모달 수동 열기 (예: 거리순 정렬 버튼 클릭 시).
  openPromptModal: () => void;
  // 모달 수동 닫기.
  closePromptModal: () => void;
};

const UserLocationContext = createContext<UserLocationContextValue | null>(null);

export function UserLocationProvider({ children }: { children: ReactNode }) {
  const [permission, setPermission] = useState<LocationPermissionState>("unknown");
  const [location, setLocation] = useState<GeoPoint | null>(null);
  const [lastError, setLastError] = useState<LocationLastError>(null);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  // 중복 요청 방지: 이미 요청 진행 중이면 새 호출은 skip.
  const requestInFlight = useRef(false);

  // 초기 마운트 시 permissions API로 현재 권한 상태를 한 번 조회.
  // 브라우저에 permissions API가 없거나 geolocation 자체가 없는 경우 unknown 유지.
  // setPermission 호출 패턴이 react-hooks/set-state-in-effect 규칙을 트리거해
  // useEffect 내부 직접 호출 대신 명시적으로 disable 한다.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return;
    }
    if (!navigator.permissions || typeof navigator.permissions.query !== "function") {
      setPermission("prompt");
      return;
    }
    let cancelled = false;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (cancelled) return;
        setPermission(status.state as LocationPermissionState);
        status.onchange = () => {
          setPermission(status.state as LocationPermissionState);
        };
      })
      .catch(() => {
        if (!cancelled) setPermission("prompt");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 권한이 granted로 바뀌면 자동으로 좌표를 받아온다 (location이 비어있으면).
  useEffect(() => {
    if (permission !== "granted" || location || requestInFlight.current) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    requestInFlight.current = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLastError(null);
        requestInFlight.current = false;
      },
      (err) => {
        // permission이 granted였는데 실패하는 케이스를 정확히 분류한다.
        // code 1: 권한 거부(드물지만 race에서 가능) → denied
        // code 2: 기기 위치 서비스 OFF 등 → lastError unavailable, permission은 유지
        // code 3: 타임아웃 → lastError timeout, permission은 유지
        if (err.code === 1) {
          setPermission("denied");
        } else if (err.code === 2) {
          setLastError("unavailable");
        } else if (err.code === 3) {
          setLastError("timeout");
        }
        requestInFlight.current = false;
      },
      { maximumAge: 5 * 60 * 1000, timeout: 10_000 },
    );
  }, [permission, location]);

  const requestLocation = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      // 브라우저가 geolocation을 지원하지 않으면 모달이 "허용하기" 상태로 머무르지 않게
      // unsupported 에러를 명시한다 (모달이 메시지를 그에 맞게 분기).
      setLastError("unsupported");
      return;
    }
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    await new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setPermission("granted");
          setLastError(null);
          setIsPromptModalOpen(false);
          requestInFlight.current = false;
          resolve();
        },
        (err) => {
          // PositionError code 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT.
          if (err.code === 1) {
            setPermission("denied");
            setLastError(null);
          } else if (err.code === 2) {
            setLastError("unavailable");
          } else if (err.code === 3) {
            setLastError("timeout");
          }
          requestInFlight.current = false;
          resolve();
        },
        { maximumAge: 5 * 60 * 1000, timeout: 10_000 },
      );
    });
  }, []);

  const value = useMemo<UserLocationContextValue>(
    () => ({
      permission,
      location,
      lastError,
      isPromptModalOpen,
      requestLocation,
      openPromptModal: () => setIsPromptModalOpen(true),
      closePromptModal: () => setIsPromptModalOpen(false),
    }),
    [permission, location, lastError, isPromptModalOpen, requestLocation],
  );

  return (
    <UserLocationContext.Provider value={value}>
      {children}
    </UserLocationContext.Provider>
  );
}

export function useUserLocation(): UserLocationContextValue {
  const ctx = useContext(UserLocationContext);
  if (!ctx) {
    throw new Error(
      "useUserLocation은 <UserLocationProvider> 안에서만 사용할 수 있습니다.",
    );
  }
  return ctx;
}
