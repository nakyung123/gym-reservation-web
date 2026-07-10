"use client";

import { AdminButtonSpinner } from "@/components/admin/admin-async-state";
import {
  filterLabels,
  type ReservationFilter,
} from "@/components/admin/admin-reservations-shared";
import type { Gym } from "@/types/domain";

/**
 * 관리자 예약 관리 화면의 "조회 조건 + 빠른 검색" 폼(프레젠테이션).
 *
 * 서버 조회 조건(상태·체육관·날짜·사용자·limit)과 클라이언트 빠른 검색(searchInput)을
 * 컨테이너 상태로부터 받아 표시만 한다. 조회 실행/검증은 컨테이너가 소유한다.
 */
type AdminReservationFiltersProps = {
  gyms: Gym[];
  selectedStatus: ReservationFilter;
  onStatusChange: (value: ReservationFilter) => void;
  selectedGymId: string;
  onGymIdChange: (value: string) => void;
  selectedDate: string;
  onDateChange: (value: string) => void;
  userIdInput: string;
  onUserIdChange: (value: string) => void;
  limitInput: string;
  onLimitChange: (value: string) => void;
  searchInput: string;
  onSearchChange: (value: string) => void;
  isLimitValid: boolean;
  canQuery: boolean;
  isLoading: boolean;
  onQuery: () => void;
};

export function AdminReservationFilters({
  gyms,
  selectedStatus,
  onStatusChange,
  selectedGymId,
  onGymIdChange,
  selectedDate,
  onDateChange,
  userIdInput,
  onUserIdChange,
  limitInput,
  onLimitChange,
  searchInput,
  onSearchChange,
  isLimitValid,
  canQuery,
  isLoading,
  onQuery,
}: AdminReservationFiltersProps) {
  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-sm">
      <h2 className="text-sm font-bold text-slate-950">조회 조건</h2>
      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1.2fr_1fr_1.3fr_90px_auto]">
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
          상태
          <select
            value={selectedStatus}
            onChange={(event) =>
              onStatusChange(event.target.value as ReservationFilter)
            }
            className="h-10 rounded-md border border-line-strong px-2 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {(Object.keys(filterLabels) as ReservationFilter[]).map(
              (status) => (
                <option key={status} value={status}>
                  {filterLabels[status]}
                </option>
              ),
            )}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
          체육관
          <select
            value={selectedGymId}
            onChange={(event) => onGymIdChange(event.target.value)}
            className="h-10 rounded-md border border-line-strong px-2 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <option value="">전체</option>
            {gyms.map((gym) => (
              <option key={gym.id} value={gym.id}>
                {gym.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
          날짜
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => onDateChange(event.target.value)}
            className="h-10 rounded-md border border-line-strong px-2 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
          사용자 ID
          <input
            type="text"
            value={userIdInput}
            onChange={(event) => onUserIdChange(event.target.value)}
            placeholder="전체"
            className="h-10 rounded-md border border-line-strong px-3 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
          limit
          <input
            type="number"
            min={1}
            max={200}
            step={1}
            value={limitInput}
            onChange={(event) => onLimitChange(event.target.value)}
            className="h-10 rounded-md border border-line-strong px-2 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>

        <button
          type="button"
          onClick={onQuery}
          disabled={!canQuery}
          className="h-10 self-end rounded-md bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          {isLoading ? (
            <span className="inline-flex items-center gap-2">
              <AdminButtonSpinner />
              조회 중
            </span>
          ) : (
            "조회"
          )}
        </button>
      </div>
      {!isLimitValid ? (
        <p className="mt-2 text-xs font-semibold text-error" role="alert">
          limit은 1 이상 200 이하의 정수여야 합니다.
        </p>
      ) : null}

      {/* 빠른 검색은 서버 재조회 없이 현재 목록에 즉시 적용된다.
          데이터가 커지면 서버 검색 API로 분리해 같은 입력란을 재사용한다. */}
      <div className="mt-3 flex flex-col gap-1">
        <label
          htmlFor="admin-reservation-search"
          className="text-xs font-semibold text-slate-700"
        >
          빠른 검색
        </label>
        <div className="flex gap-2">
          <input
            id="admin-reservation-search"
            type="text"
            value={searchInput}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="예약번호·시설명·사용자 ID 부분 검색"
            className="h-10 flex-1 rounded-md border border-line-strong px-3 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          {searchInput.length > 0 ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="검색어 지우기"
              className="h-10 shrink-0 rounded-md border border-line-strong bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-error/40 hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              지우기
            </button>
          ) : null}
        </div>
        <p className="text-[11px] text-slate-500">
          현재 조회된 목록에서 즉시 적용됩니다. 서버 조건을 바꾸려면 위의 조회
          조건을 변경한 뒤 조회를 누르세요.
        </p>
      </div>
    </section>
  );
}
