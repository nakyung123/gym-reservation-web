"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import {
  getFirebaseAuthSessionServerSnapshot,
  getFirebaseAuthSessionSnapshot,
  parseFirebaseAuthSessionSnapshot,
  subscribeFirebaseAuthSession,
} from "@/lib/firebase-auth-session";

const NAV_LINK_CLASS =
  "inline-flex h-9 items-center rounded px-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 sm:px-3";

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
        <Link href="/login" className={NAV_LINK_CLASS}>
          로그인
        </Link>
      )}
    </div>
  );
}
