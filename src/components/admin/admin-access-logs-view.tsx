"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAdminAccessLogs } from "@/lib/admin/admin-access-log-client";
import type { AdminAccessLogEntry } from "@/lib/admin/access-log";
import { formatAdminDateTime } from "@/lib/admin/format";
import {
  AdminEmptyState,
  AdminLoadingRow,
} from "@/components/admin/admin-async-state";
import { AdminErrorNotice } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/app-button";

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
    <div className="flex flex-col gap-6">
      {state.status === "loading" ? (
        <AdminLoadingRow message="페이지를 불러오는 중입니다." />
      ) : null}

      {state.status === "error" ? (
        <AdminErrorNotice message={state.message} />
      ) : null}

      {accessLogs && accessLogs.length === 0 ? (
        <AdminEmptyState
          title="접속 기록이 없습니다"
          description="아직 기록된 관리자 접속이 없습니다."
        />
      ) : null}

      {accessLogs && accessLogs.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {accessLogs.map((entry) => (
            <li
              key={entry.id}
              className="rounded-xl border border-line bg-white p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2">
                  <span className="rounded-full bg-accent-tint px-2.5 py-1 text-[12.5px] font-bold text-accent-strong">
                    접속
                  </span>
                  <span className="text-[13px] text-muted">
                    {entry.path}
                  </span>
                </span>
                <span className="text-[13px] tabular-nums text-muted">
                  {formatAdminDateTime(entry.createdAt)}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-0.5 text-[13px] text-muted">
                <span className="break-all">관리자 {entry.adminUid}</span>
                <span className="break-all tabular-nums">IP {entry.ip}</span>
              </div>
              <p className="mt-1 break-all text-[13px] text-subtle">
                {entry.userAgent}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {accessLogs && accessLogs.length > 0 ? (
        <div className="flex flex-col items-center gap-2">
          <p className="text-[13px] tabular-nums text-muted">
            {accessLogs.length}건 표시 중
          </p>
          {mayHaveMore && limit < LIST_LIMIT_MAX ? (
            <Button
              variant="outline"
              size="xs"
              onClick={() =>
                setLimit((current) =>
                  Math.min(current + LIST_LIMIT_STEP, LIST_LIMIT_MAX),
                )
              }
            >
              더 보기
            </Button>
          ) : null}
          {mayHaveMore && limit >= LIST_LIMIT_MAX ? (
            <p className="text-[13px] font-semibold text-muted">
              최대 {LIST_LIMIT_MAX}건까지 표시합니다.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
