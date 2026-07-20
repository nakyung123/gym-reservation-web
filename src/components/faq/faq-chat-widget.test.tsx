// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import koMessages from "../../../messages/ko.json";
import { FaqChatWidget } from "@/components/faq/faq-chat-widget";

// fetch를 모킹해 네트워크 없이 위젯 상태 전이(닫힘/열림·웰컴·스트림 렌더·429 안내)를 검증한다.
// vitest.unit.config.ts include 대상(파일 상단 @vitest-environment jsdom로 DOM 활성화).
//
// 위젯은 홈("/")에서만 렌더된다(pathname !== "/"면 null). jsdom에는 next 라우터 컨텍스트가 없어
// usePathname()이 null을 반환하므로, 홈에 있는 상황을 시뮬레이션하려면 "/"로 모킹해야 한다.
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

// 인증 세션을 직접 제어해 "로그인 주체가 바뀌면 대화가 비워지는가"를 검증한다.
// (위젯은 루트 레이아웃 상주라 로그아웃해도 언마운트되지 않는다.)
const { authRef } = vi.hoisted(() => ({
  authRef: {
    current: { ok: true, userId: "user-1" } as
      | { ok: true; userId: string }
      | { ok: false; reason: string; message: string },
    listeners: new Set<() => void>(),
    version: 0,
  },
}));

function setAuth(next: typeof authRef.current) {
  authRef.current = next;
  authRef.version += 1;
  authRef.listeners.forEach((listener) => listener());
}

vi.mock("@/lib/firebase-auth-session", () => ({
  subscribeFirebaseAuthSession: (listener: () => void) => {
    authRef.listeners.add(listener);
    return () => authRef.listeners.delete(listener);
  },
  // 스냅샷 문자열이 바뀌어야 useSyncExternalStore가 재렌더한다.
  getFirebaseAuthSessionSnapshot: () => `snap-${authRef.version}`,
  getFirebaseAuthSessionServerSnapshot: () => "snap-server",
  parseFirebaseAuthSessionSnapshot: () => authRef.current,
}));

// 토큰 획득은 이 테스트의 관심사가 아니다(비로그인 경로로 고정).
vi.mock("@/lib/firebase-client", () => ({
  getFirebaseClient: () => ({ auth: { currentUser: null } }),
}));

// 위젯 문구는 next-intl(Faq 네임스페이스)에서 오므로 ko 메시지로 감싸 렌더한다.
function renderWidget() {
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <FaqChatWidget />
    </NextIntlClientProvider>,
  );
}

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
    renderWidget();
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "채팅 상담 열기" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/자주 묻는 질문/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "가입은 어떻게 하나요?" }),
    ).toBeTruthy();
  });

  // 배포 확인에서 답변의 "**일시**:" 가 별표째 보였다(위젯이 평문으로 렌더링).
  // 모델은 마크다운으로 답하므로 렌더링 계층에서 처리해야 한다.
  it("마크다운 답변을 렌더링해 별표가 화면에 남지 않는다", async () => {
    const answer = [
      "현재 예약 내역은 다음과 같습니다:",
      "",
      "- **일시**: 2026년 7월 31일 오후 9시",
      "- **시설**: 일자산제1체육관",
    ].join("\n");
    vi.spyOn(global, "fetch").mockResolvedValue(streamOk(answer));

    renderWidget();
    fireEvent.click(screen.getByRole("button", { name: "채팅 상담 열기" }));
    fireEvent.click(
      screen.getByRole("button", { name: "가입은 어떻게 하나요?" }),
    );

    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(dialog.textContent).toContain("일자산제1체육관"),
    );

    // 별표가 화면 텍스트로 새어나오지 않아야 한다.
    expect(dialog.textContent).not.toContain("*");
    // 볼드는 실제 strong 엘리먼트로 렌더된다.
    const bold = Array.from(dialog.querySelectorAll("strong")).map(
      (node) => node.textContent,
    );
    expect(bold).toContain("일시");
    expect(bold).toContain("시설");
    // 불릿은 리스트 항목으로 (예시 질문 목록도 li라서 개수 대신 내용으로 확인).
    const items = Array.from(dialog.querySelectorAll("li")).map(
      (node) => node.textContent,
    );
    expect(items).toContain("일시: 2026년 7월 31일 오후 9시");
    expect(items).toContain("시설: 일자산제1체육관");
  });

  it("예시 질문을 누르면 응답 스트림을 렌더한다", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      streamOk("이메일로 가입할 수 있습니다."),
    );
    renderWidget();
    fireEvent.click(screen.getByRole("button", { name: "채팅 상담 열기" }));
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
    renderWidget();
    fireEvent.click(screen.getByRole("button", { name: "채팅 상담 열기" }));
    fireEvent.click(
      screen.getByRole("button", { name: "예약은 언제까지 취소할 수 있나요?" }),
    );

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain("제한");
    });
  });
});

describe("로그인 주체 변경 시 대화 초기화", () => {
  afterEach(() => {
    setAuth({ ok: true, userId: "user-1" });
    cleanup();
  });

  // 회귀 방지: 이력은 매 요청 서버로 재전송된다. 로그아웃 후에도 남아 있으면
  // 모델이 이전 사용자의 예약 내역을 도구 호출 없이 그대로 반복한다(공용 PC 유출).
  it("로그아웃하면 이전 대화가 남지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(streamOk("2026-08-01 19:00 마포구민체육센터 예약이 있습니다.")),
    );
    renderWidget();

    fireEvent.click(screen.getByRole("button", { name: "채팅 상담 열기" }));
    fireEvent.click(
      screen.getByRole("button", { name: "가입은 어떻게 하나요?" }),
    );
    await waitFor(() =>
      expect(screen.getByText(/마포구민체육센터/)).toBeTruthy(),
    );

    setAuth({ ok: false, reason: "signed-out", message: "로그아웃" });

    await waitFor(() =>
      expect(screen.queryByText(/마포구민체육센터/)).toBeNull(),
    );
  });

  it("다른 계정으로 바뀌어도 이전 대화가 남지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(streamOk("이전 사용자 예약 내용")));
    renderWidget();

    fireEvent.click(screen.getByRole("button", { name: "채팅 상담 열기" }));
    fireEvent.click(
      screen.getByRole("button", { name: "가입은 어떻게 하나요?" }),
    );
    await waitFor(() =>
      expect(screen.getByText(/이전 사용자 예약 내용/)).toBeTruthy(),
    );

    setAuth({ ok: true, userId: "user-2" });

    await waitFor(() =>
      expect(screen.queryByText(/이전 사용자 예약 내용/)).toBeNull(),
    );
  });
});
