"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { signOut } from "firebase/auth";
import { getFirebaseClient } from "@/lib/firebase-client";
import { useRequireAuth } from "@/lib/use-require-auth";
import { withdrawAccount } from "@/lib/withdrawal-client";
import {
  WITHDRAWAL_CATEGORIES,
  type WithdrawalCategory,
} from "@/lib/withdrawal";

const MAX_DETAIL_LENGTH = 300;

type SubmitState =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "active-reservation"; message: string }
  | { kind: "auth-delete-failed"; message: string }
  | { kind: "error"; message: string };

export function WithdrawView() {
  const t = useTranslations("Withdraw");
  const router = useRouter();
  const session = useRequireAuth({ from: "/mypage/withdraw" });

  const [category, setCategory] = useState<WithdrawalCategory | null>(null);
  const [detail, setDetail] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });

  if (!session.ok) {
    return (
      <section className="w-full rounded-lg border border-line bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">{t("loadingAuth")}</p>
      </section>
    );
  }

  const isWorking =
    submitState.kind === "submitting" || submitState.kind === "success";
  const isFormValid = category !== null;
  const detailCharCount = [...detail].length;

  function openConfirm() {
    if (!isFormValid || isWorking) return;
    setSubmitState({ kind: "confirming" });
  }

  function closeConfirm() {
    if (submitState.kind === "confirming") {
      setSubmitState({ kind: "idle" });
    }
  }

  async function confirmWithdraw() {
    if (!category) return;
    setSubmitState({ kind: "submitting" });
    const result = await withdrawAccount({
      category,
      detail: detail.trim().length === 0 ? null : detail.trim(),
    });
    if (result.ok) {
      setSubmitState({ kind: "success" });
      return;
    }
    if (result.reason === "active-reservation") {
      setSubmitState({ kind: "active-reservation", message: result.message });
      return;
    }
    if (result.reason === "auth-delete-failed") {
      setSubmitState({ kind: "auth-delete-failed", message: result.message });
      return;
    }
    setSubmitState({ kind: "error", message: result.message });
  }

  // auth-delete-failed 상태에서 사용자가 재시도하면 같은 API를 다시 호출한다.
  // 서버 측에서 DB는 이미 비어있고 진행 중 예약 0건이라 Auth delete만 재호출되는 효과.
  async function retryWithdraw() {
    if (!category) return;
    setSubmitState({ kind: "submitting" });
    const result = await withdrawAccount({
      category,
      detail: detail.trim().length === 0 ? null : detail.trim(),
    });
    if (result.ok) {
      setSubmitState({ kind: "success" });
      return;
    }
    if (result.reason === "auth-delete-failed") {
      setSubmitState({ kind: "auth-delete-failed", message: result.message });
      return;
    }
    setSubmitState({ kind: "error", message: result.message });
  }

  async function handleSuccessConfirm() {
    try {
      const { auth } = getFirebaseClient();
      await signOut(auth);
    } catch (error) {
      console.warn("[withdraw] signOut failed:", error);
    }
    router.replace("/");
  }

  return (
    <>
      <section className="w-full rounded-lg border border-line bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-950">{t("title")}</h1>

        <div className="mt-4 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm leading-6 text-warning">
          <p className="font-semibold">{t("warnTitle")}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>{t("warnItem1")}</li>
            <li>{t("warnItem2")}</li>
            <li>{t("warnItem3")}</li>
          </ul>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            openConfirm();
          }}
          className="mt-5 flex flex-col gap-5"
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold text-slate-800">
              {t("reasonLegend")}{" "}
              <span className="text-error">{t("reasonRequired")}</span>
            </legend>
            <div className="flex flex-col gap-2">
              {WITHDRAWAL_CATEGORIES.map((c) => (
                <label
                  key={c}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-line px-3 py-2 text-sm text-slate-800 transition hover:border-accent"
                >
                  <input
                    type="radio"
                    name="withdraw-category"
                    value={c}
                    checked={category === c}
                    onChange={() => setCategory(c)}
                    disabled={isWorking}
                    className="size-4 cursor-pointer accent-accent"
                  />
                  {c}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="withdraw-detail"
              className="text-sm font-semibold text-slate-800"
            >
              {t("detailLabel")}
            </label>
            <textarea
              id="withdraw-detail"
              value={detail}
              onChange={(e) => {
                const next = e.target.value;
                // codepoint 기준으로 300자 초과면 자르지 않고 그대로 두되, 카운터로 안내.
                setDetail(next);
              }}
              maxLength={MAX_DETAIL_LENGTH * 4 /* 안전망 */}
              rows={4}
              disabled={isWorking}
              placeholder={t("detailPlaceholder")}
              className="rounded-md border border-line-strong px-3 py-2 text-sm text-slate-950 placeholder:text-slate-400 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:bg-slate-100"
            />
            <p
              className={`self-end text-xs ${
                detailCharCount > MAX_DETAIL_LENGTH
                  ? "font-semibold text-error"
                  : "text-slate-500"
              }`}
            >
              {detailCharCount} / {MAX_DETAIL_LENGTH}
            </p>
          </div>

          <div className="mt-1 flex gap-2">
            <Link
              href="/mypage"
              className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-line-strong bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {t("cancel")}
            </Link>
            <button
              type="submit"
              disabled={
                !isFormValid || isWorking || detailCharCount > MAX_DETAIL_LENGTH
              }
              className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-error px-4 text-sm font-semibold text-white transition hover:bg-error/90 disabled:cursor-not-allowed disabled:bg-error/40"
            >
              {t("submit")}
            </button>
          </div>
        </form>

        {submitState.kind === "error" ? (
          <p
            className="mt-3 rounded-md border border-error/30 bg-error/10 px-3 py-2 text-sm text-error"
            role="alert"
          >
            {submitState.message}
          </p>
        ) : null}
      </section>

      {submitState.kind === "confirming" ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="withdraw-confirm-title"
        >
          <div className="w-full max-w-sm rounded-lg border border-line bg-white p-6 shadow-xl">
            <h2
              id="withdraw-confirm-title"
              className="text-lg font-bold text-slate-950"
            >
              {t("confirmTitle")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {t("confirmDesc")}
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeConfirm}
                className="inline-flex h-10 items-center justify-center rounded-md border border-line-strong bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
              >
                {t("confirmCancel")}
              </button>
              <button
                type="button"
                onClick={confirmWithdraw}
                className="inline-flex h-10 items-center justify-center rounded-md bg-error px-4 text-sm font-semibold text-white transition hover:bg-error/90"
              >
                {t("confirmSubmit")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {submitState.kind === "submitting" ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          role="status"
          aria-live="polite"
        >
          <div className="w-full max-w-sm rounded-lg border border-line bg-white p-6 shadow-xl">
            <p className="text-sm text-slate-700">{t("submitting")}</p>
          </div>
        </div>
      ) : null}

      {submitState.kind === "success" ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="withdraw-success-title"
        >
          <div className="w-full max-w-sm rounded-lg border border-line bg-white p-6 shadow-xl">
            <h2
              id="withdraw-success-title"
              className="text-lg font-bold text-slate-950"
            >
              {t("successTitle")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {t("successDesc")}
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={handleSuccessConfirm}
                className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent-hover"
              >
                {t("confirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {submitState.kind === "auth-delete-failed" ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="withdraw-auth-fail-title"
        >
          <div className="w-full max-w-sm rounded-lg border border-line bg-white p-6 shadow-xl">
            <h2
              id="withdraw-auth-fail-title"
              className="text-lg font-bold text-slate-950"
            >
              {t("authFailTitle")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {submitState.message}
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setSubmitState({ kind: "idle" })}
                className="inline-flex h-10 items-center justify-center rounded-md border border-line-strong bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
              >
                {t("close")}
              </button>
              <button
                type="button"
                onClick={retryWithdraw}
                className="inline-flex h-10 items-center justify-center rounded-md bg-error px-4 text-sm font-semibold text-white transition hover:bg-error/90"
              >
                {t("retry")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {submitState.kind === "active-reservation" ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="withdraw-active-title"
        >
          <div className="w-full max-w-sm rounded-lg border border-line bg-white p-6 shadow-xl">
            <h2
              id="withdraw-active-title"
              className="text-lg font-bold text-slate-950"
            >
              {t("activeReservationTitle")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {submitState.message}
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setSubmitState({ kind: "idle" })}
                className="inline-flex h-10 items-center justify-center rounded-md border border-line-strong bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
              >
                {t("close")}
              </button>
              <Link
                href="/reservations"
                className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover"
              >
                {t("viewMyReservations")}
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
