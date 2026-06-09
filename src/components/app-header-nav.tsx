"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import {
  getFirebaseAuthSessionServerSnapshot,
  getFirebaseAuthSessionSnapshot,
  parseFirebaseAuthSessionSnapshot,
  subscribeFirebaseAuthSession,
} from "@/lib/firebase-auth-session";

// 디자인 토큰 기반 nav 링크(DESIGN.md). 기본은 무채 텍스트, 인증 동작(로그인)만 액센트 강조.
const NAV_LINK_CLASS =
  "inline-flex h-9 items-center rounded-md px-2.5 text-sm font-semibold text-muted transition hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 sm:px-3";
const NAV_LINK_ACCENT =
  "inline-flex h-9 items-center rounded-md px-2.5 text-sm font-semibold text-accent-strong transition hover:bg-accent-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 sm:px-3";

// 헤더의 nav 링크. "체육관"은 항상 노출, "내 예약"/"내 정보"는 로그인 상태에서만 노출.
export function AppHeaderNav() {
  const snapshot = useSyncExternalStore(
    subscribeFirebaseAuthSession,
    getFirebaseAuthSessionSnapshot,
    getFirebaseAuthSessionServerSnapshot,
  );
  const session = parseFirebaseAuthSessionSnapshot(snapshot);
  const signedIn = session.ok;

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Link href="/gyms" className={NAV_LINK_CLASS}>
        체육관
      </Link>
      <span
        className="mx-1 h-3.5 w-px bg-line-strong"
        aria-hidden="true"
      />
      {signedIn ? (
        <>
          <Link href="/reservations" className={NAV_LINK_CLASS}>
            내 예약
          </Link>
          <Link href="/mypage" className={NAV_LINK_CLASS}>
            내 정보
          </Link>
        </>
      ) : (
        <Link href="/login" className={NAV_LINK_ACCENT}>
          로그인
        </Link>
      )}
    </div>
  );
}
