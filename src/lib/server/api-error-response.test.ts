import { afterEach, describe, expect, it, vi } from "vitest";

import { serverErrorResponse } from "./api-error-response";

describe("serverErrorResponse", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("500 응답에는 원문 오류 메시지를 노출하지 않고 서버 로그에는 안전한 진단 정보만 남긴다", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const rawError = new Error("raw database secret") as Error & {
      code: string;
    };
    rawError.code = "P2002";

    const response = serverErrorResponse(
      "잠시 후 다시 시도해 주세요.",
      "[profile] update failed",
      rawError,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "잠시 후 다시 시도해 주세요.",
    });
    expect(errorSpy).toHaveBeenCalledWith("[profile] update failed", {
      errorType: "Error",
      name: "Error",
      code: "P2002",
    });
    expect(errorSpy.mock.calls.flat().join(" ")).not.toContain("raw database");
  });

  it("허용된 오류 코드 형태가 아니면 code도 서버 로그에 남기지 않는다", () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const rawError = new Error("raw database secret") as Error & {
      code: string;
    };
    rawError.code = "secretLikeTokenValue1234567890";

    serverErrorResponse(
      "잠시 후 다시 시도해 주세요.",
      "[profile] update failed",
      rawError,
    );

    expect(errorSpy).toHaveBeenCalledWith("[profile] update failed", {
      errorType: "Error",
      name: "Error",
    });
    expect(errorSpy.mock.calls.flat().join(" ")).not.toContain(
      "secretLikeTokenValue",
    );
  });
});
