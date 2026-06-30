"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/app-button";
import { useFaqChat } from "@/hooks/use-faq-chat";

// 전역 FAQ 안내봇 위젯. 우하단 플로팅 버튼 → 패널 토글.
// flexible foundation: 예시 질문은 데이터 배열, 버튼은 app-button SSOT, 색은 네이비 토큰.
// a11y: ESC 닫기 + 포커스 복귀, 패널 내 포커스 트랩(Tab 순환), 스트리밍 영역 aria-live.

const EXAMPLE_QUESTIONS = [
  "가입은 어떻게 하나요?",
  "예약은 언제까지 취소할 수 있나요?",
  "결제는 어떻게 하나요?",
];

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), [href], textarea:not([disabled])';

export function FaqChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const { messages, status, error, send } = useFaqChat();

  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const panelId = useId();
  const titleId = useId();
  const streaming = status === "streaming";
  const isEmpty = messages.length === 0;

  // 열릴 때 입력창 포커스.
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  // 새 토큰/메시지마다 로그 하단으로 스크롤(jsdom 등 미구현 환경에선 옵셔널 호출로 건너뛴다).
  useEffect(() => {
    logEndRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages]);

  function closePanel() {
    setOpen(false);
    triggerRef.current?.focus(); // 포커스 복귀
  }

  // ESC 닫기 + Tab 포커스 트랩(패널 안에서만 순환).
  function onPanelKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      closePanel();
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) {
      return;
    }
    const focusables = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
    );
    if (focusables.length === 0) {
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || streaming) {
      return;
    }
    send(text);
    setInput("");
  }

  function askExample(question: string) {
    if (streaming) {
      return;
    }
    send(question);
  }

  // 문의하기 위젯은 홈에서만 노출한다.
  if (pathname !== "/") {
    return null;
  }

  if (!open) {
    return (
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        aria-controls={panelId}
        aria-label="문의 도우미 열기"
        className="fixed bottom-5 right-5 z-50 inline-flex h-14 items-center gap-2 rounded-full bg-accent px-5 font-bold text-accent-ink shadow-lg transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        <span aria-hidden="true">💬</span>
        문의하기
      </button>
    );
  }

  return (
    <div
      ref={panelRef}
      id={panelId}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      onKeyDown={onPanelKeyDown}
      className="fixed bottom-5 right-5 z-50 flex h-[min(560px,calc(100vh-2.5rem))] w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl"
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-3">
        <div>
          <p id={titleId} className="text-[15px] font-bold text-foreground">
            서울체육예약 문의 도우미
          </p>
          <p className="text-[12.5px] text-muted">FAQ를 바탕으로 안내해 드려요</p>
        </div>
        <button
          type="button"
          onClick={closePanel}
          aria-label="문의 도우미 닫기"
          className="inline-flex size-8 items-center justify-center rounded-md text-muted transition hover:bg-white hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      {/* 메시지 로그 */}
      <div
        role="log"
        aria-live="polite"
        aria-label="대화 내용"
        className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
      >
        {isEmpty ? (
          <div className="space-y-3">
            <p className="text-[14px] leading-relaxed text-muted">
              안녕하세요! 가입·예약·취소 등 자주 묻는 질문에 답해 드려요. 아래
              질문을 눌러보거나 직접 입력해 주세요.
            </p>
            <ul className="space-y-2">
              {EXAMPLE_QUESTIONS.map((question) => (
                <li key={question}>
                  <button
                    type="button"
                    onClick={() => askExample(question)}
                    className="w-full rounded-lg border border-line bg-white px-3 py-2 text-left text-[14px] text-foreground transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {question}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          messages.map((message) => (
            <ChatBubble
              key={message.id}
              role={message.role}
              content={message.content}
              streaming={streaming}
            />
          ))
        )}
        <div ref={logEndRef} />
      </div>

      {/* 에러 배너 */}
      {error ? (
        <div
          role="alert"
          className="border-t border-line bg-surface-2 px-4 py-2 text-[13px] text-foreground"
        >
          {error.kind === "rate-limit"
            ? `문의가 많아 잠시 제한되었어요. ${error.retryAfterSeconds > 0 ? `${error.retryAfterSeconds}초 후 ` : ""}다시 시도해 주세요.`
            : "일시적인 오류가 발생했어요. 다시 시도해 주세요."}
        </div>
      ) : null}

      {/* 입력 폼 */}
      <form
        onSubmit={submit}
        className="flex items-center gap-2 border-t border-line px-3 py-3"
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={streaming}
          aria-label="질문 입력"
          placeholder={streaming ? "답변을 작성하고 있어요…" : "질문을 입력하세요"}
          className="h-10 flex-1 rounded-lg border border-line bg-white px-3 text-[14.5px] text-foreground outline-none transition focus:border-accent disabled:bg-surface-2"
        />
        <Button type="submit" size="sm" disabled={streaming || !input.trim()}>
          전송
        </Button>
      </form>
    </div>
  );
}

function ChatBubble({
  role,
  content,
  streaming,
}: {
  role: "user" | "assistant";
  content: string;
  streaming: boolean;
}) {
  const isUser = role === "user";
  // 아직 토큰이 안 온 assistant 버블은 '입력 중' 표시.
  const showTyping = role === "assistant" && content.length === 0 && streaming;

  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={[
          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[14px] leading-relaxed",
          isUser
            ? "bg-accent text-accent-ink"
            : "border border-line bg-surface-2 text-foreground",
        ].join(" ")}
      >
        {showTyping ? (
          <span className="text-muted">…</span>
        ) : (
          content
        )}
      </div>
    </div>
  );
}
