"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchAdminAccessLogs } from "@/lib/admin/admin-access-log-client";
import type { AdminAccessLogEntry } from "@/lib/admin/access-log";
import { formatAdminDateTime } from "@/lib/admin/format";
import {
  AdminEmptyState,
  AdminLoadingRow,
} from "@/components/admin/admin-async-state";

type AccessState =
  | { status: "loading" }
  | { status: "ready"; accessLogs: AdminAccessLogEntry[] }
  | { status: "error"; message: string };

// 한 번에 불러오는 건수와 서버 상한(서버 limit 1~200과 일치).
const LIST_LIMIT_STEP = 100;
const LIST_LIMIT_MAX = 200;

export function AdminAccessLogsView() {
  const [limit, setLimit] = useState(LIST_LIMIT_STEP);
  const [state, setState] = useState<AccessState>({ status: "loading" });

  const load = useCallback(async (listLimit: number, signal: AbortSignal) => {
    setState({ status: "loading" });
    try {
      const result = await fetchAdminAccessLogs({ limit: listLimit }, signal);
      if (signal.aborted) return;
      if (result.ok) {
        setState({ status: "ready", accessLogs: result.accessLogs });
      } else {
        setState({ status: "error", message: result.message });
      }
    } catch {
      // AbortError 무시.
    }
  }, []);

  // effect body에서 곧바로 setState(loading)를 호출하지 않도록 setTimeout(0)로 미뤄
  // cascading render 경고를 피한다(다른 admin view와 동일 패턴).
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void load(limit, controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load, limit]);

  const accessLogs = state.status === "ready" ? state.accessLogs : null;
  // 결과가 limit만큼 꽉 찼으면 더 있을 수 있다고 본다(정확한 total은 API가 주지 않는다).
  const mayHaveMore = accessLogs !== null && accessLogs.length >= limit;

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 lg:px-10">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <Link
            href="/admin"
            className="text-xs font-semibold text-accent-strong hover:underline"
          >
            ← 운영 관리
          </Link>
          <h1 className="text-2xl font-bold text-slate-950">접속 기록</h1>
          <p className="text-sm text-slate-600">
            관리자 콘솔에 접속한 계정·시각·IP·기기 정보입니다. 브라우저 세션당
            1회 기록됩니다.
          </p>
        </header>

        {state.status === "loading" ? (
          <AdminLoadingRow message="페이지를 불러오는 중입니다." />
        ) : null}

        {state.status === "error" ? (
          <p
            className="rounded-md border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error"
            role="alert"
          >
            {state.message}
          </p>
        ) : null}

        {accessLogs && accessLogs.length === 0 ? (
          <AdminEmptyState
            title="접속 기록이 없습니다"
            description="아직 기록된 관리자 접속이 없습니다."
          />
        ) : null}

        {accessLogs && accessLogs.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {accessLogs.map((entry) => (
              <li
                key={entry.id}
                className="rounded-lg border border-line bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2">
                    <span className="rounded-full bg-accent-tint px-2.5 py-1 text-xs font-semibold text-accent-strong">
                      접속
                    </span>
                    <span className="text-xs text-slate-500">{entry.path}</span>
                  </span>
                  <span className="text-xs text-slate-400">
                    {formatAdminDateTime(entry.createdAt)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                  <span className="break-all">관리자 {entry.adminUid}</span>
                  <span className="break-all">IP {entry.ip}</span>
                </div>
                <p className="mt-1 break-all text-xs text-slate-400">
                  {entry.userAgent}
                </p>
              </li>
            ))}
          </ul>
        ) : null}

        {accessLogs && accessLogs.length > 0 ? (
          <div className="flex flex-col items-center gap-1">
            <p className="text-xs text-slate-500">
              {accessLogs.length}건 표시 중
            </p>
            {mayHaveMore && limit < LIST_LIMIT_MAX ? (
              <button
                type="button"
                onClick={() =>
                  setLimit((current) =>
                    Math.min(current + LIST_LIMIT_STEP, LIST_LIMIT_MAX),
                  )
                }
                className="h-9 rounded-md border border-line-strong px-4 text-sm font-semibold text-slate-700 transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                더 보기
              </button>
            ) : null}
            {mayHaveMore && limit >= LIST_LIMIT_MAX ? (
              <p className="text-xs font-semibold text-slate-500">
                최대 {LIST_LIMIT_MAX}건까지 표시합니다.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
