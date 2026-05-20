"use client";

import { useRouter } from "next/navigation";
import { useSyncExternalStore, useEffect } from "react";
import {
  getFirebaseAuthSessionServerSnapshot,
  getFirebaseAuthSessionSnapshot,
  parseFirebaseAuthSessionSnapshot,
  subscribeFirebaseAuthSession,
  type FirebaseAuthSessionResult,
} from "@/lib/firebase-auth-session";

// 클라이언트 사이드 라우팅 가드.
// signed-out 상태가 감지되면 /login?from=<현재경로>로 redirect한다.
// loading 동안에는 호출자가 자체 로딩 UI를 보여주고, ready면 user 정보를 반환한다.
export function useRequireAuth(options?: {
  redirectTo?: string;
  from?: string;
}): FirebaseAuthSessionResult {
  const router = useRouter();
  const snapshot = useSyncExternalStore(
    subscribeFirebaseAuthSession,
    getFirebaseAuthSessionSnapshot,
    getFirebaseAuthSessionServerSnapshot,
  );
  const session = parseFirebaseAuthSessionSnapshot(snapshot);

  useEffect(() => {
    if (session.ok) return;
    if (session.reason !== "signed-out") return;
    const target = options?.redirectTo ?? "/login";
    const from = sanitizeFromPath(options?.from);
    const url = from ? `${target}?from=${encodeURIComponent(from)}` : target;
    router.replace(url);
  }, [session, router, options?.redirectTo, options?.from]);

  return session;
}

// from 파라미터는 같은 origin의 path만 허용한다.
// "/"로 시작 + "//" 차단 + scheme/backslash 차단.
export function sanitizeFromPath(value: string | undefined | null): string | null {
  if (!value || typeof value !== "string") return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  if (value.includes("\\")) return null;
  // ":" 또는 protocol 패턴 (e.g. "/http://...")도 차단.
  if (/^\/[a-z]+:/i.test(value)) return null;
  return value;
}

// 소셜 OAuth는 외부 redirect 흐름이라 from path를 URL/cookie/server state에 담지 않고
// 같은 탭의 sessionStorage에 잠시 보관한다. LoginView가 set, HandoverFlow success 시 pop.
export const OAUTH_FROM_STORAGE_KEY = "auth-oauth-from-path";

// HandoverFlow 등에서 호출. sessionStorage에서 from path를 읽어 sanitize한 뒤 즉시 제거한다.
// sessionStorage 불가 환경이거나 값이 없으면 null.
export function popOauthFromPath(): string | null {
  try {
    if (typeof window === "undefined") return null;
    const value = window.sessionStorage.getItem(OAUTH_FROM_STORAGE_KEY);
    window.sessionStorage.removeItem(OAUTH_FROM_STORAGE_KEY);
    return sanitizeFromPath(value);
  } catch {
    return null;
  }
}
