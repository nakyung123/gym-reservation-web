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

type CustomersState =
  | { status: "loading" }
  | { status: "ready"; customers: CustomerSummary[] }
  | { status: "error"; message: string };

export function AdminCustomersView() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  // 같은 검색어로 다시 조회해도 effect가 재실행되도록 하는 nonce.
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<CustomersState>({ status: "loading" });

  const load = useCallback(async (q: string, signal: AbortSignal) => {
    setState({ status: "loading" });
    try {
      const result = await fetchAdminCustomers({ q: q || undefined }, signal);
      if (signal.aborted) return;
      if (result.ok) {
        setState({ status: "ready", customers: result.customers });
      } else {
        setState({ status: "error", message: result.message });
      }
    } catch {
      // AbortError(언마운트/재요청)는 무시한다.
    }
  }, []);

  // 마운트/검색 변경 시 자동 로드. effect body에서 곧바로 setState(loading)를 호출하지
  // 않도록 setTimeout(0)로 미뤄 cascading render 경고를 피한다(admin-gyms-view와 동일 패턴).
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void load(submittedQuery, controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load, submittedQuery, reloadKey]);

  const handleSubmit = useCallback(() => {
    const trimmed = query.trim();
    if (trimmed === submittedQuery) {
      setReloadKey((key) => key + 1);
    } else {
      setSubmittedQuery(trimmed);
    }
  }, [query, submittedQuery]);

  const customers = state.status === "ready" ? state.customers : null;

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
          <h1 className="text-2xl font-bold text-slate-950">고객 관리</h1>
          <p className="text-sm text-slate-600">
            가입 고객의 예약·즐겨찾기 지표를 확인하고 상세로 이동합니다.
            이메일 등 개인정보는 상세 화면에서만 표시됩니다.
          </p>
        </header>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="닉네임으로 검색"
            className="h-10 flex-1 rounded-md border border-line-strong px-3 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <button
            type="submit"
            disabled={state.status === "loading"}
            className="h-10 rounded-md bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            {state.status === "loading" ? (
              <span className="inline-flex items-center gap-2">
                <AdminButtonSpinner />
                조회 중
              </span>
            ) : (
              "검색"
            )}
          </button>
        </form>

        {state.status === "loading" ? (
          <AdminLoadingRow message="고객 목록을 불러오는 중입니다." />
        ) : null}

        {state.status === "error" ? (
          <p
            className="rounded-md border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error"
            role="alert"
          >
            {state.message}
          </p>
        ) : null}

        {customers && customers.length === 0 ? (
          <AdminEmptyState
            title={
              submittedQuery
                ? "검색 결과가 없습니다"
                : "표시할 고객이 없습니다"
            }
            description={
              submittedQuery
                ? "다른 닉네임으로 검색해 보세요."
                : "프로필이 생성된 고객이 아직 없습니다."
            }
          />
        ) : null}

        {customers && customers.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-line bg-white shadow-sm">
            <div className="hidden grid-cols-[1fr_88px_104px_72px_72px] gap-3 border-b border-line bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500 sm:grid">
              <span>닉네임</span>
              <span>로그인</span>
              <span>가입일</span>
              <span className="text-right">예약</span>
              <span className="text-right">즐겨찾기</span>
            </div>
            <ul className="divide-y divide-line">
              {customers.map((customer) => (
                <li key={customer.userId}>
                  <Link
                    href={`/admin/customers/${encodeURIComponent(customer.userId)}`}
                    className="grid grid-cols-2 gap-x-3 gap-y-1 px-4 py-3 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset sm:grid-cols-[1fr_88px_104px_72px_72px] sm:items-center"
                  >
                    <span className="col-span-2 text-sm font-semibold text-slate-950 sm:col-span-1">
                      {customer.nickname ?? "(닉네임 없음)"}
                    </span>
                    <span className="text-xs text-slate-600">
                      <span className="text-slate-400 sm:hidden">로그인 </span>
                      {providerLabel(customer.provider)}
                    </span>
                    <span className="text-xs text-slate-600">
                      <span className="text-slate-400 sm:hidden">가입 </span>
                      {formatAdminDate(customer.createdAt)}
                    </span>
                    <span className="text-xs font-semibold text-slate-800 sm:text-right">
                      <span className="text-slate-400 sm:hidden">예약 </span>
                      {customer.reservationCount}
                    </span>
                    <span className="text-xs font-semibold text-slate-800 sm:text-right">
                      <span className="text-slate-400 sm:hidden">즐겨찾기 </span>
                      {customer.activeFavoriteCount}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </main>
  );
}
