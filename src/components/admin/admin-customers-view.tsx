"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchAdminCustomers } from "@/lib/admin/admin-customer-client";
import { providerLabel, type CustomerSummary } from "@/lib/admin/customer";
import { formatAdminDate } from "@/lib/admin/format";
import {
  AdminButtonSpinner,
  AdminEmptyState,
  AdminLoadingRow,
} from "@/components/admin/admin-async-state";
import {
  ADMIN_CONTROL_CLASS,
  ADMIN_FIELD_LABEL_CLASS,
  AdminErrorNotice,
  AdminPanel,
  AdminTable,
  AdminTd,
  AdminTr,
} from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/app-button";

type CustomersState =
  | { status: "loading" }
  | { status: "ready"; customers: CustomerSummary[] }
  | { status: "error"; message: string };

// 한 번에 불러오는 건수와 서버 상한(서버 limit 1~200과 일치).
const LIST_LIMIT_STEP = 50;
const LIST_LIMIT_MAX = 200;

export function AdminCustomersView() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [limit, setLimit] = useState(LIST_LIMIT_STEP);
  // 같은 검색어로 다시 조회해도 effect가 재실행되도록 하는 nonce.
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<CustomersState>({ status: "loading" });

  const load = useCallback(
    async (q: string, listLimit: number, signal: AbortSignal) => {
      setState({ status: "loading" });
      try {
        const result = await fetchAdminCustomers(
          { q: q || undefined, limit: listLimit },
          signal,
        );
        if (signal.aborted) return;
        if (result.ok) {
          setState({ status: "ready", customers: result.customers });
        } else {
          setState({ status: "error", message: result.message });
        }
      } catch {
        // AbortError(언마운트/재요청)는 무시한다.
      }
    },
    [],
  );

  // 마운트/검색 변경 시 자동 로드. effect body에서 곧바로 setState(loading)를 호출하지
  // 않도록 setTimeout(0)로 미뤄 cascading render 경고를 피한다(admin-gyms-view와 동일 패턴).
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void load(submittedQuery, limit, controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load, submittedQuery, limit, reloadKey]);

  const handleSubmit = useCallback(() => {
    const trimmed = query.trim();
    // 새 검색은 목록 크기를 처음부터 다시 늘린다.
    setLimit(LIST_LIMIT_STEP);
    if (trimmed === submittedQuery) {
      setReloadKey((key) => key + 1);
    } else {
      setSubmittedQuery(trimmed);
    }
  }, [query, submittedQuery]);

  const customers = state.status === "ready" ? state.customers : null;
  // 결과가 limit만큼 꽉 찼으면 더 있을 수 있다고 본다(정확한 total은 API가 주지 않는다).
  const mayHaveMore = customers !== null && customers.length >= limit;

  return (
    <div className="flex flex-col gap-6">
      <AdminPanel>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
          className="flex flex-col gap-4 sm:flex-row sm:items-end"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label htmlFor="customer-q" className={ADMIN_FIELD_LABEL_CLASS}>
              이름·아이디 검색
            </label>
            <input
              id="customer-q"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="이름 또는 아이디로 검색"
              className={`${ADMIN_CONTROL_CLASS} placeholder:text-subtle`}
            />
          </div>
          <Button
            type="submit"
            size="console"
            disabled={state.status === "loading"}
            className="sm:w-30"
          >
            {state.status === "loading" ? (
              <>
                <AdminButtonSpinner />
                조회 중
              </>
            ) : (
              "검색"
            )}
          </Button>
        </form>
      </AdminPanel>

      {state.status === "loading" ? (
        <AdminLoadingRow message="페이지를 불러오는 중입니다." />
      ) : null}

      {state.status === "error" ? (
        <AdminErrorNotice message={state.message} />
      ) : null}

      {customers && customers.length === 0 ? (
        <AdminEmptyState
          title={
            submittedQuery ? "검색 결과가 없습니다" : "표시할 고객이 없습니다"
          }
          description={
            submittedQuery
              ? "다른 이름이나 아이디로 검색해 보세요."
              : "프로필이 생성된 고객이 아직 없습니다."
          }
        />
      ) : null}

      {customers && customers.length > 0 ? (
        <AdminTable
          columns={[
            { label: "이름" },
            { label: "로그인", align: "center" },
            { label: "가입일", align: "center" },
            { label: "예약", align: "right" },
            { label: "즐겨찾기", align: "right" },
          ]}
          minWidth="min-w-[720px]"
        >
          {customers.map((customer) => (
            <AdminTr key={customer.userId}>
              <AdminTd>
                <Link
                  href={`/admin/customers/${encodeURIComponent(customer.userId)}`}
                  className="block truncate font-semibold transition hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {customer.name ?? customer.loginId ?? "(이름 없음)"}
                </Link>
              </AdminTd>
              <AdminTd align="center" className="text-muted">
                {providerLabel(customer.provider)}
              </AdminTd>
              <AdminTd align="center" className="tabular-nums text-muted">
                {formatAdminDate(customer.createdAt)}
              </AdminTd>
              <AdminTd align="right" className="font-semibold tabular-nums">
                {customer.reservationCount}
              </AdminTd>
              <AdminTd align="right" className="font-semibold tabular-nums">
                {customer.activeFavoriteCount}
              </AdminTd>
            </AdminTr>
          ))}
        </AdminTable>
      ) : null}

      {customers && customers.length > 0 ? (
        <div className="flex flex-col items-center gap-2">
          <p className="text-[13px] tabular-nums text-muted">
            {customers.length}명 표시 중
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
              최대 {LIST_LIMIT_MAX}명까지 표시합니다. 이름·아이디 검색으로 범위를
              좁혀 주세요.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
