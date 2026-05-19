// @vitest-environment jsdom

import { act, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  UserLocationProvider,
  useUserLocation,
} from "@/hooks/use-user-location";

type GetCurrentPositionMock = ReturnType<typeof vi.fn>;
type PermissionsQueryMock = ReturnType<typeof vi.fn>;

type PositionLike = {
  coords: { latitude: number; longitude: number };
};

type PositionErrorLike = {
  code: 1 | 2 | 3;
  message?: string;
};

const SEOUL: PositionLike = {
  coords: { latitude: 37.5665, longitude: 126.978 },
};

let getCurrentPosition: GetCurrentPositionMock;
let permissionsQuery: PermissionsQueryMock | undefined;
let originalGeolocation: typeof navigator.geolocation;
let originalPermissions: typeof navigator.permissions;

function installGeolocation() {
  getCurrentPosition = vi.fn();
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });
}

function uninstallGeolocation() {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: undefined,
  });
}

function installPermissions(
  initialState: PermissionState = "prompt",
  queryImpl?: PermissionsQueryMock,
) {
  const status = {
    state: initialState,
    onchange: null as (() => void) | null,
  };
  permissionsQuery =
    queryImpl ?? vi.fn().mockResolvedValue(status as unknown as PermissionStatus);
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: { query: permissionsQuery },
  });
  return status;
}

function uninstallPermissions() {
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: undefined,
  });
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <UserLocationProvider>{children}</UserLocationProvider>;
}

beforeEach(() => {
  originalGeolocation = navigator.geolocation;
  originalPermissions = navigator.permissions;
  installGeolocation();
});

afterEach(() => {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: originalGeolocation,
  });
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: originalPermissions,
  });
  vi.restoreAllMocks();
});

describe("useUserLocation", () => {
  it("Provider 밖에서 호출하면 throw한다", () => {
    // Provider 없이 직접 호출. console.error의 React 경고 노이즈는 무시.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => renderHook(() => useUserLocation())).toThrow(
      /UserLocationProvider/,
    );
    errorSpy.mockRestore();
  });

  it("permissions API가 없으면 permission을 prompt로 설정한다", () => {
    uninstallPermissions();

    const { result } = renderHook(() => useUserLocation(), { wrapper });

    expect(result.current.permission).toBe("prompt");
  });

  it("permissions.query가 granted를 반환하면 자동으로 좌표를 가져온다", async () => {
    installPermissions("granted");
    getCurrentPosition.mockImplementation((success: (p: PositionLike) => void) => {
      success(SEOUL);
    });

    const { result } = renderHook(() => useUserLocation(), { wrapper });

    await waitFor(() => {
      expect(result.current.permission).toBe("granted");
    });
    await waitFor(() => {
      expect(result.current.location).toEqual({
        lat: SEOUL.coords.latitude,
        lng: SEOUL.coords.longitude,
      });
    });
    expect(result.current.lastError).toBeNull();
  });

  it("permissions.query가 denied를 반환하면 permission이 denied로 설정된다", async () => {
    installPermissions("denied");

    const { result } = renderHook(() => useUserLocation(), { wrapper });

    await waitFor(() => {
      expect(result.current.permission).toBe("denied");
    });
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("permissions.query가 실패하면 prompt로 폴백한다", async () => {
    installPermissions("prompt", vi.fn().mockRejectedValue(new Error("denied by policy")));

    const { result } = renderHook(() => useUserLocation(), { wrapper });

    await waitFor(() => {
      expect(result.current.permission).toBe("prompt");
    });
  });

  it("requestLocation 성공 시 location/granted/모달 닫힘으로 정리한다", async () => {
    installPermissions("prompt");
    getCurrentPosition.mockImplementation((success: (p: PositionLike) => void) => {
      success(SEOUL);
    });

    const { result } = renderHook(() => useUserLocation(), { wrapper });
    // 초기 마운트 effect 처리 대기
    await waitFor(() => {
      expect(result.current.permission).toBe("prompt");
    });
    act(() => {
      result.current.openPromptModal();
    });

    await act(async () => {
      await result.current.requestLocation();
    });

    expect(result.current.permission).toBe("granted");
    expect(result.current.location).toEqual({
      lat: SEOUL.coords.latitude,
      lng: SEOUL.coords.longitude,
    });
    expect(result.current.lastError).toBeNull();
    expect(result.current.isPromptModalOpen).toBe(false);
  });

  it("PositionError code 1(권한 거부)은 permission denied로 매핑한다", async () => {
    installPermissions("prompt");
    getCurrentPosition.mockImplementation(
      (_: unknown, fail: (e: PositionErrorLike) => void) => {
        fail({ code: 1 });
      },
    );

    const { result } = renderHook(() => useUserLocation(), { wrapper });
    await waitFor(() => expect(result.current.permission).toBe("prompt"));

    await act(async () => {
      await result.current.requestLocation();
    });

    expect(result.current.permission).toBe("denied");
    expect(result.current.lastError).toBeNull();
    expect(result.current.location).toBeNull();
  });

  it("PositionError code 2(기기 위치 OFF)는 lastError unavailable로 분류한다", async () => {
    installPermissions("prompt");
    getCurrentPosition.mockImplementation(
      (_: unknown, fail: (e: PositionErrorLike) => void) => {
        fail({ code: 2 });
      },
    );

    const { result } = renderHook(() => useUserLocation(), { wrapper });
    await waitFor(() => expect(result.current.permission).toBe("prompt"));

    await act(async () => {
      await result.current.requestLocation();
    });

    expect(result.current.lastError).toBe("unavailable");
    expect(result.current.permission).toBe("prompt");
  });

  it("PositionError code 3(타임아웃)은 lastError timeout으로 분류한다", async () => {
    installPermissions("prompt");
    getCurrentPosition.mockImplementation(
      (_: unknown, fail: (e: PositionErrorLike) => void) => {
        fail({ code: 3 });
      },
    );

    const { result } = renderHook(() => useUserLocation(), { wrapper });
    await waitFor(() => expect(result.current.permission).toBe("prompt"));

    await act(async () => {
      await result.current.requestLocation();
    });

    expect(result.current.lastError).toBe("timeout");
    expect(result.current.permission).toBe("prompt");
  });

  it("geolocation API 자체가 없으면 requestLocation은 unsupported를 기록한다", async () => {
    uninstallGeolocation();
    installPermissions("prompt");

    const { result } = renderHook(() => useUserLocation(), { wrapper });

    await act(async () => {
      await result.current.requestLocation();
    });

    expect(result.current.lastError).toBe("unsupported");
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("openPromptModal / closePromptModal로 모달 상태를 토글한다", async () => {
    installPermissions("prompt");

    const { result } = renderHook(() => useUserLocation(), { wrapper });
    await waitFor(() => expect(result.current.permission).toBe("prompt"));

    expect(result.current.isPromptModalOpen).toBe(false);

    act(() => {
      result.current.openPromptModal();
    });
    expect(result.current.isPromptModalOpen).toBe(true);

    act(() => {
      result.current.closePromptModal();
    });
    expect(result.current.isPromptModalOpen).toBe(false);
  });

  it("Provider 자식 컴포넌트는 정상적으로 렌더링된다", () => {
    installPermissions("prompt");
    const { container } = render(
      <UserLocationProvider>
        <div data-testid="child">child</div>
      </UserLocationProvider>,
    );
    expect(container.querySelector("[data-testid='child']")?.textContent).toBe("child");
  });
});
