"use client";

import Link from "next/link";
import { useState } from "react";
import { verifyVocPost } from "@/lib/voc-client";
import { VOC_CATEGORY_LABELS } from "@/lib/domain-constants";
import type { Gym, VocPost } from "@/types/domain";

// 공개 문의 게시판 상세: 글별 임시 비밀번호를 입력해 인증해야 본문을 볼 수 있다.
// 인증 성공 시 센터/분류/문의(본문)를 표 형태로 보여준다(KMI 고객의 소리 상세).

type State =
  | { kind: "gate" }
  | { kind: "verifying" }
  | { kind: "error"; message: string }
  | { kind: "unlocked"; post: VocPost };

export function VocDetailView({ id, gyms }: { id: string; gyms: Gym[] }) {
  const [password, setPassword] = useState("");
  const [state, setState] = useState<State>({ kind: "gate" });
  const gymNameById = new Map(gyms.map((gym) => [gym.id, gym.name]));

  const handleVerify = async () => {
    if (!/^\d{4}$/.test(password)) {
      setState({ kind: "error", message: "숫자 4자리 비밀번호를 입력해 주세요." });
      return;
    }
    setState({ kind: "verifying" });
    const result = await verifyVocPost(id, password);
    if (result.ok) {
      setState({ kind: "unlocked", post: result.post });
      return;
    }
    setState({ kind: "error", message: result.message });
  };

  if (state.kind === "unlocked") {
    const { post } = state;
    const gymName = post.gymId ? (gymNameById.get(post.gymId) ?? "-") : "전체";
    return (
      <div className="mx-auto mt-8 w-full max-w-[1400px] border-t-2 border-foreground/80">
        <DetailRow label="센터" height="h-[72px]">
          {gymName}
        </DetailRow>
        <DetailRow label="분류" height="h-[72px]">
          {VOC_CATEGORY_LABELS[post.category]}
        </DetailRow>
        <DetailRow label="문의" height="min-h-[221px]" alignTop>
          <span className="whitespace-pre-line">{post.body}</span>
        </DetailRow>

        <div className="mt-8 flex justify-center">
          <Link
            href="/faq?cat=support"
            className="inline-flex h-[48px] min-w-[120px] items-center justify-center rounded-md bg-accent px-6 text-[16px] font-semibold text-white transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            목록으로
          </Link>
        </div>
      </div>
    );
  }

  const isVerifying = state.kind === "verifying";

  // 비밀번호 인증 폼(1400×267, padding 30/40).
  return (
    <div className="mx-auto mt-8 flex h-[267px] w-full max-w-[1400px] flex-col items-center justify-center rounded-md bg-surface-2 px-10 py-[30px]">
      <p className="text-[18px] font-medium text-slate-800">
        비밀번호를 입력하여 주세요.
      </p>
      <input
        type="password"
        inputMode="numeric"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value.replace(/\D/g, "").slice(0, 4));
          if (state.kind === "error") setState({ kind: "gate" });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void handleVerify();
          }
        }}
        maxLength={4}
        placeholder="숫자 4자리 입력해주세요"
        disabled={isVerifying}
        aria-label="비밀번호"
        className="mt-[30px] h-[56px] w-[249px] max-w-full rounded-md border border-line-strong bg-white px-3.5 text-center text-[16px] text-slate-950 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
      {state.kind === "error" ? (
        <p role="alert" className="mt-2 text-[13px] font-semibold text-error">
          {state.message}
        </p>
      ) : null}
      <div className="mt-[30px] flex gap-2">
        <button
          type="button"
          onClick={handleVerify}
          disabled={isVerifying}
          className="inline-flex h-[40px] w-[100px] items-center justify-center rounded-md bg-accent text-[14px] font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          {isVerifying ? "확인 중…" : "확인"}
        </button>
        <Link
          href="/faq?cat=support"
          className="inline-flex h-[40px] w-[100px] items-center justify-center rounded-md border border-line-strong bg-white text-[14px] font-semibold text-slate-700 transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          취소
        </Link>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  height,
  alignTop = false,
  children,
}: {
  label: string;
  height: string;
  alignTop?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[160px_1fr] border-b border-line">
      <div
        className={`flex ${height} items-center justify-center bg-surface-2 px-3 text-[18px] font-semibold text-foreground`}
      >
        {label}
      </div>
      <div
        className={`flex ${height} ${alignTop ? "items-start py-5" : "items-center"} border-l border-line px-4 text-[18px] text-foreground`}
      >
        {children}
      </div>
    </div>
  );
}
