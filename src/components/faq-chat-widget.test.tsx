// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FaqChatWidget } from "@/components/faq-chat-widget";

// fetch를 모킹해 네트워크 없이 위젯 상태 전이(닫힘/열림·웰컴·스트림 렌더·429 안내)를 검증한다.
// vitest.unit.config.ts include 대상(파일 상단 @vitest-environment jsdom로 DOM 활성화).
//
// 위젯은 홈("/")에서만 렌더된다(pathname !== "/"면 null). jsdom에는 next 라우터 컨텍스트가 없어
// usePathname()이 null을 반환하므로, 홈에 있는 상황을 시뮬레이션하려면 "/"로 모킹해야 한다.
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

function streamOk(text: string): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
  return { ok: true, status: 200, body } as unknown as Response;
}

function rateLimited(): Response {
  return {
    ok: false,
    status: 429,
    json: async () => ({ retryAfterSeconds: 30 }),
  } as unknown as Response;
}

describe("FaqChatWidget", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("닫힘 상태에서 토글 버튼을 보여주고, 열면 웰컴과 예시 질문을 보여준다", () => {
    render(<FaqChatWidget />);
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "문의 도우미 열기" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/자주 묻는 질문/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "가입은 어떻게 하나요?" }),
    ).toBeTruthy();
  });

  it("예시 질문을 누르면 응답 스트림을 렌더한다", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      streamOk("이메일로 가입할 수 있습니다."),
    );
    render(<FaqChatWidget />);
    fireEvent.click(screen.getByRole("button", { name: "문의 도우미 열기" }));
    fireEvent.click(
      screen.getByRole("button", { name: "가입은 어떻게 하나요?" }),
    );

    await waitFor(() =>
      expect(screen.getByText("이메일로 가입할 수 있습니다.")).toBeTruthy(),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/faq-chat",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("429 응답이면 제한 안내 배너를 보여준다", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(rateLimited());
    render(<FaqChatWidget />);
    fireEvent.click(screen.getByRole("button", { name: "문의 도우미 열기" }));
    fireEvent.click(
      screen.getByRole("button", { name: "예약은 언제까지 취소할 수 있나요?" }),
    );

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain("제한");
    });
  });
});
