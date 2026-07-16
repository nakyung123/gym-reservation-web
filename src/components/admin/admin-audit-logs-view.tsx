"use client";

import { useCallback, useEffect, useState } from "react";
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
import {
  ADMIN_CONTROL_CLASS,
  ADMIN_FIELD_LABEL_CLASS,
  AdminErrorNotice,
  AdminPanel,
} from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/app-button";
import { SelectMenu } from "@/components/ui/select-menu";

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

// 한 번에 불러오는 건수와 서버 상한(서버 limit 1~200과 일치).
const LIST_LIMIT_STEP = 100;
const LIST_LIMIT_MAX = 200;

export function AdminAuditLogsView() {
  const [targetType, setTargetType] = useState("");
  const [limit, setLimit] = useState(LIST_LIMIT_STEP);
  const [state, setState] = useState<AuditState>({ status: "loading" });

  const load = useCallback(
    async (filterType: string, listLimit: number, signal: AbortSignal) => {
      setState({ status: "loading" });
      try {
        const result = await fetchAdminAuditLogs(
          { targetType: filterType || undefined, limit: listLimit },
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
    },
    [],
  );

  // effect body에서 곧바로 setState(loading)를 호출하지 않도록 setTimeout(0)로 미뤄
  // cascading render 경고를 피한다(admin-gyms-view와 동일 패턴).
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void load(targetType, limit, controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load, targetType, limit]);

  const auditLogs = state.status === "ready" ? state.auditLogs : null;
  // 결과가 limit만큼 꽉 찼으면 더 있을 수 있다고 본다(정확한 total은 API가 주지 않는다).
  const mayHaveMore = auditLogs !== null && auditLogs.length >= limit;

  return (
    <div className="flex flex-col gap-6">
      <AdminPanel>
        <div className="flex min-w-0 max-w-xs flex-col gap-1.5">
          <span className={ADMIN_FIELD_LABEL_CLASS}>대상</span>
          <SelectMenu
            value={targetType}
            options={TARGET_TYPE_OPTIONS}
            placeholder="전체"
            ariaLabel="대상"
            onChange={(value) => {
              setTargetType(value);
              // 필터가 바뀌면 목록 크기를 처음부터 다시 늘린다.
              setLimit(LIST_LIMIT_STEP);
            }}
            triggerClassName={ADMIN_CONTROL_CLASS}
          />
        </div>
      </AdminPanel>

      {state.status === "loading" ? (
        <AdminLoadingRow message="페이지를 불러오는 중입니다." />
      ) : null}

      {state.status === "error" ? (
        <AdminErrorNotice message={state.message} />
      ) : null}

      {auditLogs && auditLogs.length === 0 ? (
        <AdminEmptyState
          title="운영 이력이 없습니다"
          description="선택한 조건에 해당하는 기록이 없습니다."
        />
      ) : null}

      {auditLogs && auditLogs.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {auditLogs.map((entry) => (
            <li
              key={entry.id}
              className="rounded-xl border border-line bg-white p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2">
                  <span className="rounded-full bg-accent-tint px-2.5 py-1 text-[12.5px] font-bold text-accent-strong">
                    {auditActionLabel(entry.action)}
                  </span>
                  <span className="text-[13px] text-muted">
                    {auditTargetTypeLabel(entry.targetType)}
                  </span>
                </span>
                <span className="text-[13px] tabular-nums text-muted">
                  {formatAdminDateTime(entry.createdAt)}
                </span>
              </div>
              <p className="mt-3 text-[13.5px] leading-relaxed text-foreground">
                {entry.summary}
              </p>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[13px] text-subtle">
                <span className="break-all">대상 {entry.targetId}</span>
                <span className="break-all">관리자 {entry.adminUid}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {auditLogs && auditLogs.length > 0 ? (
        <div className="flex flex-col items-center gap-2">
          <p className="text-[13px] tabular-nums text-muted">
            {auditLogs.length}건 표시 중
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
              최대 {LIST_LIMIT_MAX}건까지 표시합니다. 대상 필터로 범위를 좁혀
              주세요.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
