"use client";

import { useCallback, useState } from "react";
import { getFirebaseClient } from "@/lib/firebase-client";

// FAQ 안내봇 클라이언트 로직. 대화 상태는 클라가 보유하고 요청마다 history를 함께 보낸다
// (서버는 stateless). 응답은 plain text 스트림이라 청크를 누적해 assistant 메시지를 갱신한다.
//
// 상태 전이: idle → streaming → (idle | error). error는 다시 send하면 해제된다.
// 부분 실패: 4xx/5xx/429는 비어 있던 assistant placeholder를 제거하고 error로 표면화한다
// (말없는 빈 응답 금지). 스트림 도중 끊기면 서버가 in-band 안내 문구를 넣어준다.

export type ChatRole = "user" | "assistant";
export type ChatMessage = { id: string; role: ChatRole; content: string };
export type ChatStatus = "idle" | "streaming" | "error";

export type FaqChatError =
  | { kind: "rate-limit"; retryAfterSeconds: number }
  | { kind: "server" }
  | { kind: "network" };

const ENDPOINT = "/api/faq-chat";

/**
 * 로그인 상태면 ID 토큰을, 아니면 null을 준다.
 *
 * FAQ 봇은 비로그인에서도 동작하는 게 정상이라 실패를 오류로 올리지 않는다.
 * 토큰이 없으면 서버가 예약 도구 없이 답한다.
 */
async function getFaqIdToken(): Promise<string | null> {
  try {
    const { auth } = getFirebaseClient();
    if (!auth.currentUser) return null;
    return await auth.currentUser.getIdToken();
  } catch {
    return null;
  }
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `m-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useFaqChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [error, setError] = useState<FaqChatError | null>(null);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || status === "streaming") {
        return;
      }

      setError(null);
      const userMessage: ChatMessage = {
        id: newId(),
        role: "user",
        content: trimmed,
      };
      const assistantId = newId();

      // 서버로 보낼 history = 기존 대화 + 이번 질문(서버가 다시 캡·검증한다).
      const payload = [...messages, userMessage].map((message) => ({
        role: message.role,
        content: message.content,
      }));

      setMessages((prev) => [
        ...prev,
        userMessage,
        { id: assistantId, role: "assistant", content: "" },
      ]);
      setStatus("streaming");

      const dropAssistant = () =>
        setMessages((prev) => prev.filter((message) => message.id !== assistantId));

      try {
        // 로그인 상태면 ID 토큰을 함께 보낸다. 서버는 이 토큰의 uid로만 예약을 조회하며,
        // 없으면 예약 도구 없이 FAQ만 답한다(비로그인 접근이 막히지 않는다).
        // 토큰 획득 실패는 치명적이지 않으므로 조용히 비로그인으로 진행한다.
        const idToken = await getFaqIdToken();

        const response = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
          body: JSON.stringify({ messages: payload }),
        });

        if (!response.ok) {
          let retryAfterSeconds = 0;
          try {
            const data = (await response.json()) as { retryAfterSeconds?: unknown };
            if (typeof data.retryAfterSeconds === "number") {
              retryAfterSeconds = data.retryAfterSeconds;
            }
          } catch {
            // 본문 파싱 실패는 무시 — status로 판단한다.
          }
          dropAssistant();
          setError(
            response.status === 429
              ? { kind: "rate-limit", retryAfterSeconds }
              : { kind: "server" },
          );
          setStatus("error");
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          dropAssistant();
          setError({ kind: "network" });
          setStatus("error");
          return;
        }

        const decoder = new TextDecoder();
        let accumulated = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          accumulated += decoder.decode(value, { stream: true });
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId
                ? { ...message, content: accumulated }
                : message,
            ),
          );
        }
        setStatus("idle");
      } catch {
        dropAssistant();
        setError({ kind: "network" });
        setStatus("error");
      }
    },
    [messages, status],
  );

  const reset = useCallback(() => {
    setMessages([]);
    setStatus("idle");
    setError(null);
  }, []);

  return { messages, status, error, send, reset };
}
