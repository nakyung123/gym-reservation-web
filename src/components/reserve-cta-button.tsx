"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import {
  getFirebaseAuthSessionServerSnapshot,
  getFirebaseAuthSessionSnapshot,
  parseFirebaseAuthSessionSnapshot,
  subscribeFirebaseAuthSession,
} from "@/lib/firebase-auth-session";

// 체육관 상세의 "예약하기" CTA.
// 로그인 상태면 /reserve/<gymId>로 바로 이동, 미로그인이면 모달로 안내 후 /login으로.

export function ReserveCtaButton({ gymId }: { gymId: string }) {
  const router = useRouter();
  const snapshot = useSyncExternalStore(
    subscribeFirebaseAuthSession,
    getFirebaseAuthSessionSnapshot,
    getFirebaseAuthSessionServerSnapshot,
  );
  const session = parseFirebaseAuthSessionSnapshot(snapshot);
  const [showModal, setShowModal] = useState(false);

  const reservePath = `/reserve/${gymId}`;

  const handleClick = () => {
    if (session.ok) {
      router.push(reservePath);
      return;
    }
    setShowModal(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-md bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
      >
        예약하기
      </button>

      {showModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reserve-gate-title"
        >
          <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
            <h2
              id="reserve-gate-title"
              className="text-lg font-bold text-slate-950"
            >
              로그인이 필요합니다
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              예약은 로그인 후 이용할 수 있습니다.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  router.push(
                    `/login?from=${encodeURIComponent(reservePath)}`,
                  );
                }}
                className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                로그인
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
