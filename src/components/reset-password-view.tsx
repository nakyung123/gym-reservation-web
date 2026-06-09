"use client";

import Link from "next/link";
import { useState } from "react";
import { sendPasswordReset } from "@/lib/firebase-email-auth";

type SubmitState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "sent" };

const GENERIC_MESSAGE =
  "입력하신 이메일이 등록된 계정이라면 비밀번호 재설정 메일을 보냈습니다. 메일함을 확인해 주세요.";

export function ResetPasswordView() {
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
      <h1 className="text-xl font-bold text-slate-950">비밀번호 재설정</h1>
      <p className="mt-1 text-sm text-slate-600">
        가입하신 이메일을 입력하면 재설정 링크가 포함된 메일이 발송됩니다.
      </p>

      {submitState.kind === "sent" ? (
        <p
          className="mt-5 rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm text-success"
          role="status"
        >
          {GENERIC_MESSAGE}
        </p>
      ) : (
        <form className="mt-5 flex flex-col gap-3" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate-800">이메일</span>
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
            {submitState.kind === "loading" ? "전송 중" : "재설정 메일 보내기"}
          </button>
        </form>
      )}

      <p className="mt-5 text-center text-sm text-slate-600">
        <Link
          href="/login"
          className="font-semibold text-accent-strong underline-offset-2 hover:underline"
        >
          로그인으로 돌아가기
        </Link>
      </p>
    </section>
  );
}
