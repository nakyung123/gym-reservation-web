"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchAdminAuditLogs } from "@/lib/admin/admin-audit-log-client";
import {
  auditActionLabel,
  auditTargetTypeLabel,
  type AuditLogEntry,
} from "@/lib/admin/audit-log";
import { formatAdminDateTime } from "@/lib/admin/format";
import {
  AdminEmptyState,
  AdminLoadingRow,
} from "@/components/admin/admin-async-state";

type AuditState =
  | { status: "loading" }
  | { status: "ready"; auditLogs: AuditLogEntry[] }
  | { status: "error"; message: string };

const TARGET_TYPE_OPTIONS = [
  { value: "", label: "전체" },
  { value: "reservation", label: "예약" },
  { value: "gym", label: "시설" },
  { value: "slot", label: "슬롯" },
  { value: "user", label: "고객" },
];

export function AdminAuditLogsView() {
  const [targetType, setTargetType] = useState("");
  const [state, setState] = useState<AuditState>({ status: "loading" });

  const load = useCallback(async (filterType: string, signal: AbortSignal) => {
    setState({ status: "loading" });
    try {
      const result = await fetchAdminAuditLogs(
        { targetType: filterType || undefined },
        signal,
      );
      if (signal.aborted) return;
      if (result.ok) {
        setState({ status: "ready", auditLogs: result.auditLogs });
      } else {
        setState({ status: "error", message: result.message });
      }
    } catch {
      // AbortError 무시.
    }
  }, []);

  // effect body에서 곧바로 setState(loading)를 호출하지 않도록 setTimeout(0)로 미뤄
  // cascading render 경고를 피한다(admin-gyms-view와 동일 패턴).
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void load(targetType, controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load, targetType]);

  const auditLogs = state.status === "ready" ? state.auditLogs : null;

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
          <h1 className="text-2xl font-bold text-slate-950">운영 이력</h1>
          <p className="text-sm text-slate-600">
            관리자 액션(예약 취소·이용 완료, 시설/슬롯 변경, 고객 메모 등)의 기록입니다.
            개인정보 원문은 기록하지 않습니다.
          </p>
        </header>

        <div className="flex items-center gap-2">
          <label
            htmlFor="audit-target-type"
            className="text-xs font-semibold text-slate-500"
          >
            대상
          </label>
          <select
            id="audit-target-type"
            value={targetType}
            onChange={(event) => setTargetType(event.target.value)}
            className="h-9 rounded-md border border-line-strong px-2 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {TARGET_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

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

        {auditLogs && auditLogs.length === 0 ? (
          <AdminEmptyState
            title="운영 이력이 없습니다"
            description="선택한 조건에 해당하는 기록이 없습니다."
          />
        ) : null}

        {auditLogs && auditLogs.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {auditLogs.map((entry) => (
              <li
                key={entry.id}
                className="rounded-lg border border-line bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2">
                    <span className="rounded-full bg-accent-tint px-2.5 py-1 text-xs font-semibold text-accent-strong">
                      {auditActionLabel(entry.action)}
                    </span>
                    <span className="text-xs text-slate-500">
                      {auditTargetTypeLabel(entry.targetType)}
                    </span>
                  </span>
                  <span className="text-xs text-slate-400">
                    {formatAdminDateTime(entry.createdAt)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-800">{entry.summary}</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-400">
                  <span className="break-all">대상 {entry.targetId}</span>
                  <span className="break-all">관리자 {entry.adminUid}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </main>
  );
}
