"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import {
  getFirebaseAuthSessionServerSnapshot,
  getFirebaseAuthSessionSnapshot,
  parseFirebaseAuthSessionSnapshot,
  subscribeFirebaseAuthSession,
} from "@/lib/firebase-auth-session";

// 체육관 상세의 "예약하기" CTA.
// 로그인 상태면 /reserve/<gymId>로 바로 이동, 미로그인이면 모달로 안내 후 /login으로.

export function ReserveCtaButton({ gymId }: { gymId: string }) {
  const t = useTranslations("GymDetail");
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
        className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        {t("reserveCta")}
      </button>

      {showModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reserve-gate-title"
        >
          <div className="w-full max-w-sm rounded-lg border border-line bg-white p-6 shadow-xl">
            <h2
              id="reserve-gate-title"
              className="text-lg font-bold text-slate-950"
            >
              {t("loginRequiredTitle")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {t("loginRequiredBody")}
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="inline-flex h-10 items-center justify-center rounded-md border border-line-strong bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={() => {
                  router.push(
                    `/login?from=${encodeURIComponent(reservePath)}`,
                  );
                }}
                className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover"
              >
                {t("login")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
