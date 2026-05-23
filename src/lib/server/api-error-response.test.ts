import { afterEach, describe, expect, it, vi } from "vitest";

import { serverErrorResponse } from "./api-error-response";

describe("serverErrorResponse", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("500 응답과 서버 로그에 원문 오류 메시지를 노출하지 않는다", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const response = serverErrorResponse(
      "잠시 후 다시 시도해 주세요.",
      "[profile] update failed",
      new Error("raw database secret"),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "잠시 후 다시 시도해 주세요.",
    });
    expect(errorSpy).toHaveBeenCalledWith("[profile] update failed");
    expect(errorSpy.mock.calls.flat().join(" ")).not.toContain("raw database");
  });
});
