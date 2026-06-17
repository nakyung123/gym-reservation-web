"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { sendPasswordReset } from "@/lib/firebase-email-auth";

type SubmitState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "sent" };

export function ResetPasswordView() {
  const t = useTranslations("Auth");
  const [email, setEmail] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitState({ kind: "loading" });
    // 실제 발송 성공/실패 여부와 무관하게 같은 메시지를 보여준다 (email enumeration 방어).
    await sendPasswordReset(email);
    setSubmitState({ kind: "sent" });
  }

  return (
    <section className="w-full rounded-lg border border-line bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold text-slate-950">{t("resetTitle")}</h1>
      <p className="mt-1 text-sm text-slate-600">{t("resetSubtitle")}</p>

      {submitState.kind === "sent" ? (
        <p
          className="mt-5 rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm text-success"
          role="status"
        >
          {t("resetSent")}
        </p>
      ) : (
        <form className="mt-5 flex flex-col gap-3" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate-800">
              {t("email")}
            </span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 rounded-md border border-line-strong px-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </label>
          <button
            type="submit"
            disabled={submitState.kind === "loading"}
            className="mt-1 inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {submitState.kind === "loading" ? t("resetSubmitting") : t("resetSubmit")}
          </button>
        </form>
      )}

      <p className="mt-5 text-center text-sm text-slate-600">
        <Link
          href="/login"
          className="font-semibold text-accent-strong underline-offset-2 hover:underline"
        >
          {t("backToLogin")}
        </Link>
      </p>
    </section>
  );
}
