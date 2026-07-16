"use client";

import { AdminButtonSpinner } from "@/components/admin/admin-async-state";
import {
  ADMIN_CONTROL_CLASS,
  ADMIN_FIELD_LABEL_CLASS,
  AdminPanel,
} from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/app-button";
import { SelectMenu } from "@/components/ui/select-menu";
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
 * 룩은 콘솔 규격(admin-ui)을 따른다: 패널 rounded-xl, 컨트롤 h-9, 라벨 11.5px.
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
  const statusOptions = (
    Object.keys(filterLabels) as ReservationFilter[]
  ).map((status) => ({ value: status, label: filterLabels[status] }));

  const gymOptions = [
    { value: "", label: "전체" },
    ...gyms.map((gym) => ({ value: gym.id, label: gym.name })),
  ];

  return (
    <AdminPanel title="조회 조건">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1.2fr_1fr_1.3fr_96px_auto] lg:items-end">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className={ADMIN_FIELD_LABEL_CLASS}>상태</span>
          <SelectMenu
            value={selectedStatus}
            options={statusOptions}
            placeholder="전체"
            ariaLabel="상태"
            onChange={(value) => onStatusChange(value as ReservationFilter)}
            triggerClassName={ADMIN_CONTROL_CLASS}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <span className={ADMIN_FIELD_LABEL_CLASS}>체육관</span>
          <SelectMenu
            value={selectedGymId}
            options={gymOptions}
            placeholder="전체"
            ariaLabel="체육관"
            onChange={onGymIdChange}
            triggerClassName={ADMIN_CONTROL_CLASS}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="admin-reservation-date" className={ADMIN_FIELD_LABEL_CLASS}>
            날짜
          </label>
          <input
            id="admin-reservation-date"
            type="date"
            value={selectedDate}
            onChange={(event) => onDateChange(event.target.value)}
            className={ADMIN_CONTROL_CLASS}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="admin-reservation-user" className={ADMIN_FIELD_LABEL_CLASS}>
            사용자 ID
          </label>
          <input
            id="admin-reservation-user"
            type="text"
            value={userIdInput}
            onChange={(event) => onUserIdChange(event.target.value)}
            placeholder="전체"
            className={`${ADMIN_CONTROL_CLASS} placeholder:text-subtle`}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="admin-reservation-limit" className={ADMIN_FIELD_LABEL_CLASS}>
            limit
          </label>
          <input
            id="admin-reservation-limit"
            type="number"
            min={1}
            max={200}
            step={1}
            value={limitInput}
            onChange={(event) => onLimitChange(event.target.value)}
            className={`${ADMIN_CONTROL_CLASS} tabular-nums`}
          />
        </div>

        <Button size="console" onClick={onQuery} disabled={!canQuery}>
          {isLoading ? (
            <>
              <AdminButtonSpinner />
              조회 중
            </>
          ) : (
            "조회"
          )}
        </Button>
      </div>

      {!isLimitValid ? (
        <p className="mt-2 text-[13px] font-semibold text-error" role="alert">
          limit은 1 이상 200 이하의 정수여야 합니다.
        </p>
      ) : null}

      {/* 빠른 검색은 서버 재조회 없이 현재 목록에 즉시 적용된다.
          데이터가 커지면 서버 검색 API로 분리해 같은 입력란을 재사용한다. */}
      <div className="mt-[25px] flex flex-col gap-1.5 border-t border-line pt-[25px]">
        <label
          htmlFor="admin-reservation-search"
          className={ADMIN_FIELD_LABEL_CLASS}
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
            className={`${ADMIN_CONTROL_CLASS} flex-1 placeholder:text-subtle`}
          />
          {searchInput.length > 0 ? (
            <Button
              variant="outline"
              size="console"
              onClick={() => onSearchChange("")}
              aria-label="검색어 지우기"
              className="shrink-0"
            >
              지우기
            </Button>
          ) : null}
        </div>
        <p className="text-[13px] leading-relaxed text-muted">
          현재 조회된 목록에서 즉시 적용됩니다. 서버 조건을 바꾸려면 위의 조회
          조건을 변경한 뒤 조회를 누르세요.
        </p>
      </div>
    </AdminPanel>
  );
}
